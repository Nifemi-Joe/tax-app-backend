const WHT = require('../models/WHT');
const Expense = require('../models/Expense');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const User = require("../models/User");
const Client = require("../models/Client");
const logAction = require("../utils/auditLogger");
const emailService = require('../utils/emailService');

// Helper function to generate unique WHT ID
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

// @desc Create a new WHT record
// @route POST /api/wht/create
// @access Private
exports.createWHT = asyncHandler(async (req, res) => {
    await check('companyName', 'Company name is required').not().isEmpty().run(req);
    await check('totalTransactionAmount', 'Transaction amount must be a positive number').isFloat({ min: 0 }).run(req);
    await check('sourceType', 'Source type must be expense or invoice').isIn(['expense', 'invoice']).run(req);
    await check('sourceId', 'Source ID is required').not().isEmpty().run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            responseCode: "24",
            responseMessage: "Validation failed",
            errors: errors.array()
        });
    }

    try {
        const {
            transDate,
            companyName,
            totalTransactionAmount,
            whtRate = 5,
            vatRate = 7.5,
            sourceType,
            sourceId,
            invoiceNo,
            clientId,
            description
        } = req.body;

        // Generate unique WHT ID
        const whtId = await generateWHTId();

        const whtData = {
            whtId,
            transDate: transDate || new Date(),
            companyName,
            totalTransactionAmount,
            whtRate,
            vatRate,
            sourceType,
            sourceId,
            sourceModel: sourceType === 'expense' ? 'Expense' : 'Invoice',
            invoiceNo: invoiceNo || null,
            clientId: clientId || null,
            description,
            companyId: req.user.companyId,
            createdBy: req.user._id
        };

        const wht = await WHT.create(whtData);

        if (wht) {
            const user = await User.findById(req.user._id);
            await logAction(
                req.user._id,
                user.name || `${user.firstname} ${user.lastname}`,
                'created_wht',
                "WHT Management",
                `Created WHT record ${whtId} for ${companyName} by ${user.email}`,
                req.body.ip || req.ip
            );

            res.status(201).json({
                responseCode: "00",
                responseMessage: "WHT record created successfully!",
                responseData: wht
            });
        } else {
            res.status(400).json({
                responseCode: "24",
                responseMessage: "Invalid WHT data"
            });
        }
    } catch (error) {
        console.error('Create WHT error:', error);
        res.status(500).json({
            responseCode: "99",
            responseMessage: "Failed to create WHT record. Please try again."
        });
    }
});

// @desc Update WHT record
// @route PUT /api/wht/update/:id
// @access Private
exports.updateWHT = asyncHandler(async (req, res) => {
    const wht = await WHT.findById(req.params.id);

    if (!wht) {
        return res.status(404).json({
            responseCode: "24",
            responseMessage: 'WHT record not found'
        });
    }

    const updates = { ...req.body, updatedBy: req.user._id };

    const updatedWHT = await WHT.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    });

    const user = await User.findById(req.user._id);
    await logAction(
        req.user._id,
        user.name || `${user.firstname} ${user.lastname}`,
        'updated_wht',
        "WHT Management",
        `Updated WHT record ${wht.whtId} by ${user.email}`,
        req.body.ip || req.ip
    );

    res.status(200).json({
        responseCode: "00",
        responseMessage: "WHT record updated successfully!",
        responseData: updatedWHT
    });
});

// @desc Get all WHT records with filters
// @route GET /api/wht/read
// @access Private
exports.getAllWHT = asyncHandler(async (req, res) => {
    const { sourceType, status = 'unpaid' } = req.query;

    let query = {};

    // Don't include deleted records unless specifically requested
    if (status !== 'all') {
        query.status = { $ne: 'deleted' };
    }

    if (sourceType && ['expense', 'invoice'].includes(sourceType)) {
        query.sourceType = sourceType;
    }

    const whtRecords = await WHT.find(query)
        .populate('sourceId')
        .populate('clientId', 'name email')
        .populate('createdBy', 'firstname lastname email')
        .sort({ transDate: -1 });

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Completed successfully",
        responseData: whtRecords
    });
});

// @desc Get WHT records by source type (expense or invoice)
// @route GET /api/wht/by-source/:sourceType
// @access Private
exports.getWHTBySource = asyncHandler(async (req, res) => {
    const { sourceType } = req.params;

    if (!['expense', 'invoice'].includes(sourceType)) {
        return res.status(400).json({
            responseCode: "24",
            responseMessage: "Invalid source type. Must be 'expense' or 'invoice'"
        });
    }

    const whtRecords = await WHT.find({
        sourceType,
        status: { $ne: 'deleted' }
    })
        .populate('sourceId')
        .populate('clientId', 'name email')
        .sort({ transDate: -1 });

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Completed successfully",
        responseData: whtRecords
    });
});

// @desc Get WHT report by period (Monthly, Quarterly, Yearly, Custom)
// @route POST /api/wht/report
// @access Private
exports.getWHTReport = asyncHandler(async (req, res) => {
    const {
        reportType, // 'monthly', 'quarterly', 'yearly', 'custom'
        year,
        month,
        quarter,
        startDate,
        endDate,
        sourceType
    } = req.body;

    let query = { status: { $ne: 'deleted' } };

    // Add source type filter if provided
    if (sourceType && ['expense', 'invoice'].includes(sourceType)) {
        query.sourceType = sourceType;
    }

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
            return res.status(400).json({
                responseCode: "24",
                responseMessage: "Invalid report type. Must be 'monthly', 'quarterly', 'yearly', or 'custom'"
            });
    }

    const whtRecords = await WHT.find(query)
        .populate('sourceId')
        .populate('clientId', 'name email')
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

    // Round totals to 2 decimal places
    totals.totalTransAmount = parseFloat(totals.totalTransAmount.toFixed(2));
    totals.totalWHT = parseFloat(totals.totalWHT.toFixed(2));
    totals.totalVAT = parseFloat(totals.totalVAT.toFixed(2));
    totals.totalAmountDue = parseFloat(totals.totalAmountDue.toFixed(2));

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
    }

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Report generated successfully",
        responseData: {
            records: whtRecords,
            totals,
            reportType,
            period,
            recordCount: whtRecords.length
        }
    });
});

// @desc Get WHT summary statistics
// @route GET /api/wht/summary
// @access Private
exports.getWHTSummary = asyncHandler(async (req, res) => {
    const { sourceType, year } = req.query;

    let matchQuery = { status: { $ne: 'deleted' } };

    if (sourceType) {
        matchQuery.sourceType = sourceType;
    }

    if (year) {
        matchQuery.year = parseInt(year);
    }

    const summary = await WHT.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: null,
                totalTransactionAmount: { $sum: '$totalTransactionAmount' },
                totalWHTAmount: { $sum: '$whtAmount' },
                totalVATAmount: { $sum: '$vatAmount' },
                totalAmountDue: { $sum: '$amountDue' },
                totalRecords: { $sum: 1 },
                paidCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                },
                unpaidCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, 1, 0] }
                },
                paidAmount: {
                    $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$whtAmount', 0] }
                },
                unpaidAmount: {
                    $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, '$whtAmount', 0] }
                }
            }
        }
    ]);

    // Get breakdown by source type
    const sourceBreakdown = await WHT.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: '$sourceType',
                count: { $sum: 1 },
                totalAmount: { $sum: '$totalTransactionAmount' },
                totalWHT: { $sum: '$whtAmount' }
            }
        }
    ]);

    // Get monthly breakdown for current year
    const currentYear = year || new Date().getFullYear();
    const monthlyBreakdown = await WHT.aggregate([
        {
            $match: {
                ...matchQuery,
                year: parseInt(currentYear)
            }
        },
        {
            $group: {
                _id: '$monthNumber',
                month: { $first: '$month' },
                count: { $sum: 1 },
                totalAmount: { $sum: '$totalTransactionAmount' },
                totalWHT: { $sum: '$whtAmount' },
                totalVAT: { $sum: '$vatAmount' }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Summary generated successfully",
        responseData: {
            overall: summary[0] || {
                totalTransactionAmount: 0,
                totalWHTAmount: 0,
                totalVATAmount: 0,
                totalAmountDue: 0,
                totalRecords: 0,
                paidCount: 0,
                unpaidCount: 0,
                paidAmount: 0,
                unpaidAmount: 0
            },
            bySourceType: sourceBreakdown,
            monthlyBreakdown
        }
    });
});

// @desc Soft delete WHT record
// @route DELETE /api/wht/delete/:id
// @access Private
exports.softDeleteWHT = asyncHandler(async (req, res) => {
    const wht = await WHT.findById(req.params.id);

    if (!wht) {
        return res.status(404).json({
            responseCode: "24",
            responseMessage: 'WHT record not found'
        });
    }

    wht.status = 'deleted';
    wht.updatedBy = req.user._id;
    await wht.save();

    const user = await User.findById(req.user._id);
    await logAction(
        req.user._id,
        user.name || `${user.firstname} ${user.lastname}`,
        'deleted_wht',
        "WHT Management",
        `Deleted WHT record ${wht.whtId} by ${user.email}`,
        req.body.ip || req.ip
    );

    res.status(200).json({
        responseCode: "00",
        responseMessage: 'WHT record deleted successfully',
        responseData: wht
    });
});

// @desc Get WHT by source ID (expense or invoice ID)
// @route GET /api/wht/by-source-id/:sourceId
// @access Private
exports.getWHTBySourceId = asyncHandler(async (req, res) => {
    const wht = await WHT.findOne({
        sourceId: req.params.sourceId,
        status: { $ne: 'deleted' }
    });

    if (!wht) {
        return res.status(404).json({
            responseCode: "24",
            responseMessage: 'WHT record not found for this source'
        });
    }

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Completed successfully",
        responseData: wht
    });
});

// @desc Pay WHT
// @route POST /api/wht/pay
// @access Private
exports.payWHT = asyncHandler(async (req, res) => {
    const { whtIds } = req.body;
    const user = await User.findById(req.user._id);

    if (!whtIds || !whtIds.length) {
        return res.status(400).json({
            responseCode: "24",
            responseMessage: "WHT IDs are required"
        });
    }

    const whtRecords = await WHT.find({ whtId: { $in: whtIds } });

    if (!whtRecords.length) {
        return res.status(404).json({
            responseMessage: 'No valid WHT records found for the provided IDs.',
            responseCode: "22"
        });
    }

    const alreadyPaid = whtRecords.filter(wht => wht.status === 'paid');
    if (alreadyPaid.length > 0) {
        const paidIds = alreadyPaid.map(wht => wht.whtId);
        return res.status(400).json({
            responseMessage: 'Some WHT records have already been paid.',
            responseCode: "22",
            alreadyPaidIds: paidIds,
        });
    }

    const totalAmount = whtRecords.reduce((sum, wht) => sum + wht.whtAmount, 0);

    await WHT.updateMany(
        { whtId: { $in: whtIds } },
        { status: 'paid', updatedBy: req.user._id, updatedAt: new Date() }
    );

    await logAction(
        req.user._id,
        user.name || `${user.firstname} ${user.lastname}`,
        'paid_wht',
        "WHT Management",
        `Paid WHT records: ${whtIds.join(', ')} by ${user.email}`,
        req.body.ip || req.ip
    );

    res.status(200).json({
        responseMessage: 'WHT paid successfully!',
        responseData: {
            totalAmount,
            paidRecords: whtIds.length
        },
        responseCode: "00"
    });
});

// @desc Create or update WHT for expense
// @route Internal use
exports.handleExpenseWHT = async (expense, whtData, userId, isUpdate = false) => {
    try {
        const {
            companyName,
            whtRate = 5,
            vatRate = 7.5,
            enableWHT = false
        } = whtData;

        if (!enableWHT) {
            // If WHT is disabled, soft delete existing WHT record if any
            if (isUpdate) {
                await WHT.findOneAndUpdate(
                    { sourceId: expense._id, sourceType: 'expense' },
                    { status: 'deleted', updatedBy: userId, updatedAt: new Date() }
                );
            }
            return null;
        }

        // Check if WHT record exists for this expense
        const existingWHT = await WHT.findOne({
            sourceId: expense._id,
            sourceType: 'expense',
            status: { $ne: 'deleted' }
        });

        const whtPayload = {
            transDate: expense.date,
            companyName: companyName || expense.description || 'N/A',
            totalTransactionAmount: expense.amount,
            whtRate,
            vatRate,
            sourceType: 'expense',
            sourceId: expense._id,
            sourceModel: 'Expense',
            description: expense.description,
            updatedBy: userId,
            updatedAt: new Date()
        };

        if (existingWHT && isUpdate) {
            // Update existing WHT record
            return await WHT.findByIdAndUpdate(existingWHT._id, whtPayload, {
                new: true,
                runValidators: true
            });
        } else if (!existingWHT) {
            // Create new WHT record
            const whtId = await generateWHTId();
            return await WHT.create({
                ...whtPayload,
                whtId,
                createdBy: userId
            });
        }

        return existingWHT;
    } catch (error) {
        console.error('WHT handling error:', error);
        throw error;
    }
};

// Export helper functions
exports.calculateWHTValues = calculateWHTValues;
exports.generateWHTId = generateWHTId;