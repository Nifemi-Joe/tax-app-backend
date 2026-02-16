const Expense = require('../models/Expense');
const WHT = require('../models/WHT');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const User = require("../models/User");
const logAction = require("../utils/auditLogger");

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

// Helper function to calculate WHT values
const calculateWHTValues = (transactionAmount, whtRate = 5, vatRate = 7.5) => {
    const whtAmount = parseFloat(((whtRate / 100) * transactionAmount).toFixed(2));
    const vatAmount = parseFloat(((vatRate / 100) * transactionAmount).toFixed(2));
    const amountDue = parseFloat((transactionAmount - whtAmount + vatAmount).toFixed(2));

    return { whtAmount, vatAmount, amountDue };
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
            whtAmount,
            vatAmount,
            amountDue,
            ...expenseFields
        } = req.body;

        // Validate company name if WHT is enabled
        if (enableWHT && (!companyName || companyName.trim() === '')) {
            return res.status(400).json({
                responseCode: "24",
                responseMessage: "Company name is required when WHT is enabled"
            });
        }

        const expenseData = {
            ...expenseFields,
            enableWHT: enableWHT || false,
            companyName: enableWHT ? companyName : null,
            whtRate: enableWHT ? (whtRate || 5) : null,
            vatRate: enableWHT ? (vatRate || 7.5) : null,
            whtAmount: enableWHT ? whtAmount : null,
            vatAmount: enableWHT ? vatAmount : null,
            amountDue: enableWHT ? amountDue : null,
            createdBy: req.user._id,
            companyId: req.user.companyId,
            status: "created"
        };

        const expense = await Expense.create(expenseData);

        if (expense) {
            // Handle WHT record creation if enabled
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
                `Created expense ${expense.description} by ${user.email}${enableWHT ? ` with WHT for ${companyName}` : ''}`,
                req.body.ip || req.ip
            );

            // Prepare response data with WHT info
            const responseData = {
                ...expense.toObject(),
                whtData: enableWHT ? {
                    enableWHT: true,
                    companyName: expense.companyName,
                    whtRate: expense.whtRate,
                    vatRate: expense.vatRate,
                    whtAmount: expense.whtAmount,
                    vatAmount: expense.vatAmount,
                    amountDue: expense.amountDue,
                    whtRecordId: whtRecord?._id,
                    whtId: whtRecord?.whtId
                } : null
            };

            res.status(201).json({
                responseCode: "00",
                responseMessage: "Expense added successfully!",
                responseData
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
        whtAmount,
        vatAmount,
        amountDue,
        ...updateFields
    } = req.body;

    // Validate company name if WHT is enabled
    if (enableWHT && (!companyName || companyName.trim() === '')) {
        return res.status(400).json({
            responseCode: "24",
            responseMessage: "Company name is required when WHT is enabled"
        });
    }

    const updates = {
        ...updateFields,
        enableWHT: enableWHT || false,
        companyName: enableWHT ? companyName : null,
        whtRate: enableWHT ? (whtRate || 5) : null,
        vatRate: enableWHT ? (vatRate || 7.5) : null,
        whtAmount: enableWHT ? whtAmount : null,
        vatAmount: enableWHT ? vatAmount : null,
        amountDue: enableWHT ? amountDue : null,
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
        `Updated expense ${expense.description} by ${user.email}${enableWHT ? ` with WHT for ${companyName}` : ''}`,
        req.body.ip || req.ip
    );

    // Prepare response data with WHT info
    const responseData = {
        ...updatedExpense.toObject(),
        whtData: enableWHT ? {
            enableWHT: true,
            companyName: updatedExpense.companyName,
            whtRate: updatedExpense.whtRate,
            vatRate: updatedExpense.vatRate,
            whtAmount: updatedExpense.whtAmount,
            vatAmount: updatedExpense.vatAmount,
            amountDue: updatedExpense.amountDue,
            whtRecordId: whtRecord?._id,
            whtId: whtRecord?.whtId
        } : null
    };

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Expense updated successfully!",
        responseData
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
        const expensesWithWHT = expenses.map(expense => {
            const whtRecord = whtMap[expense._id.toString()];
            return {
                ...expense,
                whtData: expense.enableWHT ? {
                    enableWHT: expense.enableWHT,
                    companyName: expense.companyName,
                    whtRate: expense.whtRate,
                    vatRate: expense.vatRate,
                    whtAmount: expense.whtAmount,
                    vatAmount: expense.vatAmount,
                    amountDue: expense.amountDue,
                    whtRecordId: whtRecord?._id,
                    whtId: whtRecord?.whtId,
                    whtStatus: whtRecord?.status
                } : null
            };
        });

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
            whtData: expense.enableWHT ? {
                enableWHT: expense.enableWHT,
                companyName: expense.companyName,
                whtRate: expense.whtRate,
                vatRate: expense.vatRate,
                whtAmount: expense.whtAmount,
                vatAmount: expense.vatAmount,
                amountDue: expense.amountDue,
                whtRecordId: whtData?._id,
                whtId: whtData?.whtId,
                whtStatus: whtData?.status
            } : null
        }
    });
});

// @desc Spool expenses by category or date range
// @route POST /api/expenses/spool
// @access Private
exports.spoolExpenses = asyncHandler(async (req, res) => {
    const { category, startDate, endDate, enableWHT } = req.body;

    let query = { status: { $ne: 'deleted' } };

    if (category) {
        query.category = category;
    }

    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
    }

    if (enableWHT !== undefined) {
        query.enableWHT = enableWHT;
    }

    const expenses = await Expense.find(query).lean();

    // Get WHT data for expenses with WHT enabled
    const expenseIds = expenses.filter(e => e.enableWHT).map(e => e._id);
    const whtRecords = await WHT.find({
        sourceId: { $in: expenseIds },
        sourceType: 'expense',
        status: { $ne: 'deleted' }
    }).lean();

    const whtMap = {};
    whtRecords.forEach(wht => {
        whtMap[wht.sourceId.toString()] = wht;
    });

    const expensesWithWHT = expenses.map(expense => {
        const whtRecord = whtMap[expense._id.toString()];
        return {
            ...expense,
            whtData: expense.enableWHT ? {
                enableWHT: expense.enableWHT,
                companyName: expense.companyName,
                whtRate: expense.whtRate,
                vatRate: expense.vatRate,
                whtAmount: expense.whtAmount,
                vatAmount: expense.vatAmount,
                amountDue: expense.amountDue,
                whtRecordId: whtRecord?._id,
                whtId: whtRecord?.whtId
            } : null
        };
    });

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Completed successfully",
        responseData: expensesWithWHT
    });
});

// @desc Get expenses with WHT only
// @route GET /api/expenses/with-wht
// @access Private
exports.getExpensesWithWHT = asyncHandler(async (req, res) => {
    const expenses = await Expense.find({
        enableWHT: true,
        status: { $ne: 'deleted' }
    }).lean();

    if (expenses && expenses.length > 0) {
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

        const expensesWithWHT = expenses.map(expense => {
            const whtRecord = whtMap[expense._id.toString()];
            return {
                ...expense,
                whtData: {
                    enableWHT: expense.enableWHT,
                    companyName: expense.companyName,
                    whtRate: expense.whtRate,
                    vatRate: expense.vatRate,
                    whtAmount: expense.whtAmount,
                    vatAmount: expense.vatAmount,
                    amountDue: expense.amountDue,
                    whtRecordId: whtRecord?._id,
                    whtId: whtRecord?.whtId,
                    whtStatus: whtRecord?.status
                }
            };
        });

        // Calculate totals
        const totals = expensesWithWHT.reduce((acc, expense) => {
            acc.totalAmount += expense.amount || 0;
            acc.totalWHT += expense.whtAmount || 0;
            acc.totalVAT += expense.vatAmount || 0;
            acc.totalAmountDue += expense.amountDue || 0;
            return acc;
        }, {
            totalAmount: 0,
            totalWHT: 0,
            totalVAT: 0,
            totalAmountDue: 0
        });

        res.status(200).json({
            responseCode: "00",
            responseMessage: "Completed successfully",
            responseData: {
                expenses: expensesWithWHT,
                totals: {
                    totalAmount: parseFloat(totals.totalAmount.toFixed(2)),
                    totalWHT: parseFloat(totals.totalWHT.toFixed(2)),
                    totalVAT: parseFloat(totals.totalVAT.toFixed(2)),
                    totalAmountDue: parseFloat(totals.totalAmountDue.toFixed(2)),
                    count: expensesWithWHT.length
                }
            }
        });
    } else {
        res.status(200).json({
            responseCode: "22",
            responseMessage: "No expenses with WHT found.",
            responseData: {
                expenses: [],
                totals: {
                    totalAmount: 0,
                    totalWHT: 0,
                    totalVAT: 0,
                    totalAmountDue: 0,
                    count: 0
                }
            }
        });
    }
});

// @desc Get WHT summary for expenses
// @route GET /api/expenses/wht-summary
// @access Private
exports.getExpenseWHTSummary = asyncHandler(async (req, res) => {
    const { year, month, quarter } = req.query;

    let matchQuery = {
        enableWHT: true,
        status: { $ne: 'deleted' }
    };

    // Add date filters
    if (year || month) {
        matchQuery.date = {};
        if (year) {
            const startOfYear = new Date(year, 0, 1);
            const endOfYear = new Date(year, 11, 31, 23, 59, 59);
            matchQuery.date.$gte = startOfYear;
            matchQuery.date.$lte = endOfYear;
        }
        if (month) {
            const monthIndex = new Date(`${month} 1, 2000`).getMonth();
            matchQuery.date.$gte = new Date(year || new Date().getFullYear(), monthIndex, 1);
            matchQuery.date.$lte = new Date(year || new Date().getFullYear(), monthIndex + 1, 0, 23, 59, 59);
        }
    }

    const summary = await Expense.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: null,
                totalTransactionAmount: { $sum: '$amount' },
                totalWHTAmount: { $sum: '$whtAmount' },
                totalVATAmount: { $sum: '$vatAmount' },
                totalAmountDue: { $sum: '$amountDue' },
                totalRecords: { $sum: 1 },
                uniqueCompanies: { $addToSet: '$companyName' }
            }
        }
    ]);

    // Get breakdown by company
    const companyBreakdown = await Expense.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: '$companyName',
                totalAmount: { $sum: '$amount' },
                totalWHT: { $sum: '$whtAmount' },
                totalVAT: { $sum: '$vatAmount' },
                totalAmountDue: { $sum: '$amountDue' },
                count: { $sum: 1 }
            }
        },
        { $sort: { totalAmount: -1 } }
    ]);

    // Get monthly breakdown
    const monthlyBreakdown = await Expense.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: {
                    year: { $year: '$date' },
                    month: { $month: '$date' }
                },
                totalAmount: { $sum: '$amount' },
                totalWHT: { $sum: '$whtAmount' },
                totalVAT: { $sum: '$vatAmount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    const formattedMonthlyBreakdown = monthlyBreakdown.map(item => ({
        year: item._id.year,
        month: months[item._id.month - 1],
        monthNumber: item._id.month,
        totalAmount: parseFloat(item.totalAmount.toFixed(2)),
        totalWHT: parseFloat(item.totalWHT.toFixed(2)),
        totalVAT: parseFloat(item.totalVAT.toFixed(2)),
        count: item.count
    }));

    res.status(200).json({
        responseCode: "00",
        responseMessage: "WHT Summary generated successfully",
        responseData: {
            overall: summary[0] || {
                totalTransactionAmount: 0,
                totalWHTAmount: 0,
                totalVATAmount: 0,
                totalAmountDue: 0,
                totalRecords: 0,
                uniqueCompanies: []
            },
            byCompany: companyBreakdown.map(item => ({
                companyName: item._id || 'Unknown',
                totalAmount: parseFloat(item.totalAmount.toFixed(2)),
                totalWHT: parseFloat(item.totalWHT.toFixed(2)),
                totalVAT: parseFloat(item.totalVAT.toFixed(2)),
                totalAmountDue: parseFloat(item.totalAmountDue.toFixed(2)),
                transactionCount: item.count
            })),
            monthlyBreakdown: formattedMonthlyBreakdown
        }
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
        enableWHT: expense.enableWHT,
        companyName: expense.companyName,
        whtRate: expense.whtRate,
        vatRate: expense.vatRate,
        whtAmount: expense.whtAmount,
        vatAmount: expense.vatAmount,
        amountDue: expense.amountDue,
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
        reportType,
        year,
        month,
        quarter,
        startDate,
        endDate
    } = req.body;

    let query = {
        enableWHT: true,
        status: { $ne: 'deleted' }
    };

    // Add date filters based on report type
    const currentYear = year || new Date().getFullYear();

    switch (reportType) {
        case 'monthly':
            if (!year || !month) {
                return res.status(400).json({
                    responseCode: "24",
                    responseMessage: "Year and month are required for monthly report"
                });
            }
            const monthIndex = new Date(`${month} 1, 2000`).getMonth();
            query.date = {
                $gte: new Date(year, monthIndex, 1),
                $lte: new Date(year, monthIndex + 1, 0, 23, 59, 59)
            };
            break;

        case 'quarterly':
            if (!year || !quarter) {
                return res.status(400).json({
                    responseCode: "24",
                    responseMessage: "Year and quarter are required for quarterly report"
                });
            }
            const quarterMonths = {
                'Q1': [0, 2],
                'Q2': [3, 5],
                'Q3': [6, 8],
                'Q4': [9, 11]
            };
            const [startMonth, endMonth] = quarterMonths[quarter];
            query.date = {
                $gte: new Date(year, startMonth, 1),
                $lte: new Date(year, endMonth + 1, 0, 23, 59, 59)
            };
            break;

        case 'yearly':
            if (!year) {
                return res.status(400).json({
                    responseCode: "24",
                    responseMessage: "Year is required for yearly report"
                });
            }
            query.date = {
                $gte: new Date(year, 0, 1),
                $lte: new Date(year, 11, 31, 23, 59, 59)
            };
            break;

        case 'custom':
            if (!startDate || !endDate) {
                return res.status(400).json({
                    responseCode: "24",
                    responseMessage: "Start date and end date are required for custom report"
                });
            }
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
            break;

        default:
            break;
    }

    const expenses = await Expense.find(query).sort({ date: 1 }).lean();

    // Calculate totals
    const totals = expenses.reduce((acc, expense) => {
        acc.totalTransAmount += expense.amount || 0;
        acc.totalWHT += expense.whtAmount || 0;
        acc.totalVAT += expense.vatAmount || 0;
        acc.totalAmountDue += expense.amountDue || 0;
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

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // Format records for tax returns template
    const formattedRecords = expenses.map((expense, index) => {
        const expenseDate = new Date(expense.date);
        return {
            sNo: index + 1,
            month: months[expenseDate.getMonth()],
            year: expenseDate.getFullYear(),
            transDate: expenseDate.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }),
            companyName: expense.companyName || expense.description || 'N/A',
            transAmount: expense.amount,
            whtRate: expense.whtRate,
            wht: expense.whtAmount,
            vatRate: expense.vatRate,
            vat: expense.vatAmount,
            amountDue: expense.amountDue
        };
    });

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

module.exports = exports;