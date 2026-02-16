const Expense = require('../models/Expense');
const WHT = require('../models/WHT');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const User = require("../models/User");
const logAction = require("../utils/auditLogger");
const { handleExpenseWHT } = require('./whtController');

const getBase64FileSize = (base64String) => {
    if (!base64String) return 0;
    const base64Data = base64String.split(',')[1] || base64String;
    const padding = (base64Data.match(/=/g) || []).length;
    return (base64Data.length * 3 / 4) - padding;
};

// Helper to generate WHT ID
const generateWHTId = async () => {
    const count = await WHT.countDocuments();
    const timestamp = Date.now().toString().slice(-6);
    return `WHT-${timestamp}-${(count + 1).toString().padStart(5, '0')}`;
};

// @desc Create a new expense
// @route POST /api/expenses/create
// @access Private
exports.createExpense = asyncHandler(async (req, res) => {
    await check('amount', 'Amount must be a positive number').isFloat({ min: 0 }).run(req);
    await check('category', 'Category is required').not().isEmpty().run(req);
    await check('date', 'Date is required').isISO8601().run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            responseCode: "24",
            responseMessage: "Validation failed",
            errors: errors.array()
        });
    }

    const maxFileSize = 10 * 1024 * 1024;

    if (req.body.image) {
        const imageSize = getBase64FileSize(req.body.image);
        if (imageSize > maxFileSize) {
            return res.status(413).json({
                responseCode: "25",
                responseMessage: "Expense image file too large. Maximum size is 10MB."
            });
        }
    }

    if (req.body.receipt) {
        const receiptSize = getBase64FileSize(req.body.receipt);
        if (receiptSize > maxFileSize) {
            return res.status(413).json({
                responseCode: "26",
                responseMessage: "Receipt file too large. Maximum size is 10MB."
            });
        }
    }

    try {
        const {
            enableWHT,
            companyName,
            whtRate,
            vatRate,
            ...expenseFields
        } = req.body;

        const expenseData = {
            ...expenseFields,
            createdBy: req.user._id,
            companyId: req.user.companyId,
            status: "created"
        };

        const expense = await Expense.create(expenseData);

        if (expense) {
            // Handle WHT record creation
            let whtRecord = null;
            if (enableWHT) {
                const whtId = await generateWHTId();
                whtRecord = await WHT.create({
                    whtId,
                    transDate: expense.date,
                    companyName: companyName || expense.description || 'N/A',
                    totalTransactionAmount: expense.amount,
                    whtRate: whtRate || 5,
                    vatRate: vatRate || 7.5,
                    sourceType: 'expense',
                    sourceId: expense._id,
                    sourceModel: 'Expense',
                    description: expense.description,
                    companyId: req.user.companyId,
                    createdBy: req.user._id
                });
            }

            const user = await User.findById(req.user._id);
            await logAction(
                req.user._id,
                user.name || `${user.firstname} ${user.lastname}`,
                'created_expense',
                "Expense Management",
                `Created expense ${expense.description} by ${user.email}`,
                req.body.ip || req.ip
            );

            res.status(201).json({
                responseCode: "00",
                responseMessage: "Expense added successfully!",
                responseData: {
                    expense,
                    wht: whtRecord
                }
            });
        } else {
            res.status(400).json({
                responseCode: "24",
                responseMessage: "Invalid expense data"
            });
        }
    } catch (error) {
        console.error('Create expense error:', error);
        res.status(500).json({
            responseCode: "99",
            responseMessage: "Failed to create expense. Please try again."
        });
    }
});

// @desc Update an existing expense
// @route PUT /api/expenses/update/:id
// @access Private
exports.updateExpense = asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
        return res.status(404).json({
            responseCode: "24",
            responseMessage: 'Expense not found'
        });
    }

    const {
        enableWHT,
        companyName,
        whtRate,
        vatRate,
        ...updateFields
    } = req.body;

    const updates = {
        ...updateFields,
        updatedBy: req.user._id
    };

    const updatedExpense = await Expense.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
    });

    // Handle WHT record update
    let whtRecord = null;

    // Find existing WHT record
    const existingWHT = await WHT.findOne({
        sourceId: expense._id,
        sourceType: 'expense',
        status: { $ne: 'deleted' }
    });

    if (enableWHT) {
        if (existingWHT) {
            // Update existing WHT record
            whtRecord = await WHT.findByIdAndUpdate(existingWHT._id, {
                transDate: updatedExpense.date,
                companyName: companyName || updatedExpense.description || 'N/A',
                totalTransactionAmount: updatedExpense.amount,
                whtRate: whtRate || existingWHT.whtRate,
                vatRate: vatRate || existingWHT.vatRate,
                description: updatedExpense.description,
                updatedBy: req.user._id
            }, { new: true, runValidators: true });
        } else {
            // Create new WHT record
            const whtId = await generateWHTId();
            whtRecord = await WHT.create({
                whtId,
                transDate: updatedExpense.date,
                companyName: companyName || updatedExpense.description || 'N/A',
                totalTransactionAmount: updatedExpense.amount,
                whtRate: whtRate || 5,
                vatRate: vatRate || 7.5,
                sourceType: 'expense',
                sourceId: updatedExpense._id,
                sourceModel: 'Expense',
                description: updatedExpense.description,
                companyId: req.user.companyId,
                createdBy: req.user._id
            });
        }
    } else if (existingWHT && enableWHT === false) {
        // Soft delete WHT record if WHT is disabled
        await WHT.findByIdAndUpdate(existingWHT._id, {
            status: 'deleted',
            updatedBy: req.user._id
        });
    }

    const user = await User.findById(req.user._id);
    await logAction(
        req.user._id,
        user.name || `${user.firstname} ${user.lastname}`,
        'updated_expense',
        "Expense Management",
        `Updated expense ${expense.description} by ${user.email}`,
        req.body.ip || req.ip
    );

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Expense updated successfully!",
        responseData: {
            expense: updatedExpense,
            wht: whtRecord
        }
    });
});

// @desc Get list of all expenses with WHT data
// @route GET /api/expenses/read
// @access Private
exports.getAllExpenses = asyncHandler(async (req, res) => {
    const expenses = await Expense.find().lean();

    if (expenses && expenses.length > 0) {
        // Fetch WHT data for each expense
        const expenseIds = expenses.map(e => e._id);
        const whtRecords = await WHT.find({
            sourceId: { $in: expenseIds },
            sourceType: 'expense',
            status: { $ne: 'deleted' }
        }).lean();

        // Create a map for quick lookup
        const whtMap = {};
        whtRecords.forEach(wht => {
            whtMap[wht.sourceId.toString()] = wht;
        });

        // Attach WHT data to expenses
        const expensesWithWHT = expenses.map(expense => ({
            ...expense,
            whtData: whtMap[expense._id.toString()] || null
        }));

        res.status(200).json({
            responseCode: "00",
            responseMessage: "Completed successfully",
            responseData: expensesWithWHT
        });
    } else {
        res.status(200).json({
            responseCode: "22",
            responseMessage: "No expense found.",
            responseData: []
        });
    }
});

// @desc Print an expense
// @route GET /api/expenses/:id/print
// @access Private
exports.printExpense = asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
        return res.status(404).json({ message: 'Expense not found' });
    }

    // Get associated WHT data
    const whtData = await WHT.findOne({
        sourceId: expense._id,
        sourceType: 'expense',
        status: { $ne: 'deleted' }
    });

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Completed successfully",
        responseData: {
            ...expense.toObject(),
            whtData
        }
    });
});

// @desc Spool expenses by category or date range
// @route POST /api/expenses/spool
// @access Private
exports.spoolExpenses = asyncHandler(async (req, res) => {
    const { category, startDate, endDate } = req.body;

    let query = { status: { $ne: 'deleted' } };

    if (category) {
        query.category = category;
    }

    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(query).lean();

    // Get WHT data for expenses
    const expenseIds = expenses.map(e => e._id);
    const whtRecords = await WHT.find({
        sourceId: { $in: expenseIds },
        sourceType: 'expense',
        status: { $ne: 'deleted' }
    }).lean();

    const whtMap = {};
    whtRecords.forEach(wht => {
        whtMap[wht.sourceId.toString()] = wht;
    });

    const expensesWithWHT = expenses.map(expense => ({
        ...expense,
        whtData: whtMap[expense._id.toString()] || null
    }));

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Completed successfully",
        responseData: expensesWithWHT
    });
});

// @desc Track expense payments
// @route GET /api/expenses/:id/track
// @access Private
exports.trackExpense = asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
        return res.status(404).json({ message: 'Expense not found' });
    }

    const whtData = await WHT.findOne({
        sourceId: expense._id,
        sourceType: 'expense',
        status: { $ne: 'deleted' }
    });

    res.status(200).json({
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        status: expense.status,
        paidOn: expense.paidOn,
        whtData
    });
});

// @desc Disburse or claim an expense
// @route PUT /api/expenses/:id/disburse
// @access Private
exports.disburseExpense = asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
        return res.status(404).json({ message: 'Expense not found' });
    }

    if (expense.status !== 'Pending') {
        return res.status(400).json({ message: 'Expense is already disbursed or claimed' });
    }

    expense.status = 'Disbursed';
    expense.paidOn = new Date();

    await expense.save();

    res.status(200).json({ message: 'Expense disbursed successfully', expense });
});

// @desc Soft delete expense
// @route DELETE /api/expenses/delete/:id
// @access Private
exports.softDeleteExpense = asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
        return res.status(404).json({ message: 'Expense not found' });
    }

    expense.status = 'deleted';
    expense.deletedBy = req.user._id;
    await expense.save();

    // Also soft delete associated WHT record
    await WHT.findOneAndUpdate(
        { sourceId: expense._id, sourceType: 'expense' },
        { status: 'deleted', updatedBy: req.user._id }
    );

    const user = await User.findById(req.user._id);
    await logAction(
        req.user._id,
        user.name || `${user.firstname} ${user.lastname}`,
        'deleted_expense',
        "Expense Management",
        `Deleted expense ${expense.description} by ${user.email}`,
        req.body.ip || req.ip
    );

    res.status(200).json({
        responseCode: "00",
        responseMessage: 'Expense deleted successfully',
        responseData: expense
    });
});

// @desc Get expense tax returns report
// @route POST /api/expenses/tax-returns
// @access Private
exports.getExpenseTaxReturns = asyncHandler(async (req, res) => {
    const {
        reportType, // 'monthly', 'quarterly', 'yearly', 'custom'
        year,
        month,
        quarter,
        startDate,
        endDate
    } = req.body;

    // Get WHT records for expenses
    let query = {
        sourceType: 'expense',
        status: { $ne: 'deleted' }
    };

    switch (reportType) {
        case 'monthly':
            if (!year || !month) {
                return res.status(400).json({
                    responseCode: "24",
                    responseMessage: "Year and month are required for monthly report"
                });
            }
            query.year = parseInt(year);
            query.month = month;
            break;

        case 'quarterly':
            if (!year || !quarter) {
                return res.status(400).json({
                    responseCode: "24",
                    responseMessage: "Year and quarter are required for quarterly report"
                });
            }
            query.year = parseInt(year);
            query.quarter = quarter;
            break;

        case 'yearly':
            if (!year) {
                return res.status(400).json({
                    responseCode: "24",
                    responseMessage: "Year is required for yearly report"
                });
            }
            query.year = parseInt(year);
            break;

        case 'custom':
            if (!startDate || !endDate) {
                return res.status(400).json({
                    responseCode: "24",
                    responseMessage: "Start date and end date are required for custom report"
                });
            }
            query.transDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
            break;

        default:
            // Return all
            break;
    }

    const whtRecords = await WHT.find(query)
        .populate('sourceId')
        .sort({ transDate: 1 });

    // Calculate totals
    const totals = whtRecords.reduce((acc, record) => {
        acc.totalTransAmount += record.totalTransactionAmount;
        acc.totalWHT += record.whtAmount;
        acc.totalVAT += record.vatAmount;
        acc.totalAmountDue += record.amountDue;
        return acc;
    }, {
        totalTransAmount: 0,
        totalWHT: 0,
        totalVAT: 0,
        totalAmountDue: 0
    });

    // Round totals
    totals.totalTransAmount = parseFloat(totals.totalTransAmount.toFixed(2));
    totals.totalWHT = parseFloat(totals.totalWHT.toFixed(2));
    totals.totalVAT = parseFloat(totals.totalVAT.toFixed(2));
    totals.totalAmountDue = parseFloat(totals.totalAmountDue.toFixed(2));

    // Format records for tax returns template
    const formattedRecords = whtRecords.map((record, index) => ({
        sNo: index + 1,
        month: record.month,
        year: record.year,
        transDate: new Date(record.transDate).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }),
        companyName: record.companyName,
        transAmount: record.totalTransactionAmount,
        whtRate: record.whtRate,
        wht: record.whtAmount,
        vatRate: record.vatRate,
        vat: record.vatAmount,
        amountDue: record.amountDue
    }));

    // Format period string
    let period = '';
    switch (reportType) {
        case 'monthly':
            period = `${month} ${year}`;
            break;
        case 'quarterly':
            const quarterLabels = {
                'Q1': 'January - March',
                'Q2': 'April - June',
                'Q3': 'July - September',
                'Q4': 'October - December'
            };
            period = `${quarterLabels[quarter]} ${year}`;
            break;
        case 'yearly':
            period = `Year ${year}`;
            break;
        case 'custom':
            period = `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`;
            break;
        default:
            period = 'All Records';
    }

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Tax returns report generated successfully",
        responseData: {
            records: formattedRecords,
            totals,
            reportType,
            period,
            recordCount: formattedRecords.length
        }
    });
});