const TaxReturn = require('../models/TaxReturn');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const logAction = require('../utils/auditLogger');
const AuditLog = require('../models/AuditLog');

// @desc    Create a new tax return
// @route   POST /api/tax-returns
// @access  Private
exports.createTaxReturn = asyncHandler(async (req, res) => {
    // Validate inputs
    await check('companyName', 'Company name is required').not().isEmpty().run(req);
    await check('transactionAmount', 'Transaction amount is required').isNumeric().run(req);
    await check('whtRate', 'WHT rate is required').isNumeric().run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            responseCode: "22",
            errors: errors.array()
        });
    }

    const { transDate, companyName, transactionAmount, whtRate } = req.body;

    // Create the tax return
    const taxReturn = await TaxReturn.create({
        transDate: transDate || new Date(),
        companyName,
        transactionAmount,
        whtRate,
        createdBy: req.user._id
    });

    if (taxReturn) {
        const user = await User.findById(req.user._id);

        // Log the action
        await AuditLog.create({
            userId: user._id,
            userName: user.firstname ? `${user.firstname} ${user.lastname}` : user.name,
            action: 'create_tax_return',
            module: 'Tax Returns',
            details: `Created tax return for ${companyName} with amount ${transactionAmount}`,
            ipAddress: req.ip,
        });

        res.status(201).json({
            responseCode: "00",
            responseMessage: "Tax return created successfully",
            responseData: taxReturn,
        });
    } else {
        res.status(400).json({
            responseCode: "22",
            responseMessage: "Invalid tax return data",
        });
    }
});

// @desc    Update tax return
// @route   PUT /api/tax-returns/:id
// @access  Private
exports.updateTaxReturn = asyncHandler(async (req, res) => {
    const taxReturn = await TaxReturn.findById(req.params.id);

    if (!taxReturn) {
        return res.status(404).json({
            responseCode: "24",
            responseMessage: "Tax return not found"
        });
    }

    const { transDate, companyName, transactionAmount, whtRate, reasonForUpdate } = req.body;

    // Update fields
    taxReturn.transDate = transDate || taxReturn.transDate;
    taxReturn.companyName = companyName || taxReturn.companyName;
    taxReturn.transactionAmount = transactionAmount !== undefined ? transactionAmount : taxReturn.transactionAmount;
    taxReturn.whtRate = whtRate !== undefined ? whtRate : taxReturn.whtRate;
    taxReturn.reasonForUpdate = reasonForUpdate;
    taxReturn.updatedBy = req.user._id;

    const updatedTaxReturn = await taxReturn.save();

    const user = await User.findById(req.user._id);

    await logAction(
        user._id,
        user.firstname ? `${user.firstname} ${user.lastname}` : user.name,
        'update_tax_return',
        'Tax Returns',
        `Updated tax return for ${updatedTaxReturn.companyName}`,
        req.ip
    );

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Tax return updated successfully",
        responseData: updatedTaxReturn
    });
});

// @desc    Get all tax returns
// @route   GET /api/tax-returns
// @access  Private
exports.getAllTaxReturns = asyncHandler(async (req, res) => {
    const taxReturns = await TaxReturn.find({ status: { $ne: 'deleted' } })
        .populate('createdBy', 'firstname lastname name email')
        .sort({ createdAt: -1 });

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Completed successfully",
        responseData: taxReturns
    });
});

// @desc    Get tax return by ID
// @route   GET /api/tax-returns/:id
// @access  Private
exports.getTaxReturnById = asyncHandler(async (req, res) => {
    const taxReturn = await TaxReturn.findById(req.params.id)
        .populate('createdBy', 'firstname lastname name email');

    if (!taxReturn) {
        return res.status(404).json({
            responseCode: "24",
            responseMessage: "Tax return not found"
        });
    }

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Completed successfully",
        responseData: taxReturn
    });
});

// @desc    Soft delete tax return
// @route   DELETE /api/tax-returns/:id
// @access  Private
exports.deleteTaxReturn = asyncHandler(async (req, res) => {
    const taxReturn = await TaxReturn.findById(req.params.id);

    if (!taxReturn) {
        return res.status(404).json({
            responseCode: "24",
            responseMessage: "Tax return not found"
        });
    }

    taxReturn.status = 'deleted';
    taxReturn.deletedBy = req.user._id;
    await taxReturn.save();

    const user = await User.findById(req.user._id);

    await logAction(
        user._id,
        user.firstname ? `${user.firstname} ${user.lastname}` : user.name,
        'delete_tax_return',
        'Tax Returns',
        `Deleted tax return for ${taxReturn.companyName}`,
        req.ip
    );

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Tax return deleted successfully"
    });
});

// @desc    Get tax returns report (Monthly, Quarterly, Yearly, Date Range)
// @route   GET /api/tax-returns/report
// @access  Private
exports.getTaxReturnsReport = asyncHandler(async (req, res) => {
    const { reportType, month, quarter, year, startDate, endDate } = req.query;

    let query = { status: { $ne: 'deleted' } };
    let reportTitle = 'Tax Returns Report';

    switch (reportType) {
        case 'monthly':
            if (month && year) {
                query.month = month;
                query.year = parseInt(year);
                reportTitle = `Tax Returns - ${month} ${year}`;
            }
            break;
        case 'quarterly':
            if (quarter && year) {
                query.quarter = quarter;
                query.year = parseInt(year);
                const quarterNames = {
                    'Q1': 'Jan-Mar',
                    'Q2': 'Apr-Jun',
                    'Q3': 'Jul-Sep',
                    'Q4': 'Oct-Dec'
                };
                reportTitle = `Tax Returns - ${quarterNames[quarter]} ${year}`;
            }
            break;
        case 'yearly':
            if (year) {
                query.year = parseInt(year);
                reportTitle = `Tax Returns - Year ${year}`;
            }
            break;
        case 'dateRange':
            if (startDate && endDate) {
                query.transDate = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
                reportTitle = `Tax Returns - ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`;
            }
            break;
        default:
            break;
    }

    const taxReturns = await TaxReturn.find(query)
        .populate('createdBy', 'firstname lastname name email')
        .sort({ transDate: 1 });

    // Calculate totals
    const totals = taxReturns.reduce((acc, curr) => {
        acc.totalTransAmount += curr.transactionAmount;
        acc.totalWHT += curr.wht;
        acc.totalVAT += curr.vat;
        acc.totalAmountDue += curr.amountDue;
        return acc;
    }, {
        totalTransAmount: 0,
        totalWHT: 0,
        totalVAT: 0,
        totalAmountDue: 0
    });

    // Format totals to 2 decimal places
    totals.totalTransAmount = Number(totals.totalTransAmount.toFixed(2));
    totals.totalWHT = Number(totals.totalWHT.toFixed(2));
    totals.totalVAT = Number(totals.totalVAT.toFixed(2));
    totals.totalAmountDue = Number(totals.totalAmountDue.toFixed(2));

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Report generated successfully",
        responseData: {
            reportTitle,
            records: taxReturns,
            totals,
            recordCount: taxReturns.length
        }
    });
});

// @desc    Get summary statistics
// @route   GET /api/tax-returns/summary
// @access  Private
exports.getTaxReturnsSummary = asyncHandler(async (req, res) => {
    const { year } = req.query;

    let matchQuery = { status: { $ne: 'deleted' } };

    if (year) {
        matchQuery.year = parseInt(year);
    }

    const summary = await TaxReturn.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: null,
                totalTransAmount: { $sum: '$transactionAmount' },
                totalWHT: { $sum: '$wht' },
                totalVAT: { $sum: '$vat' },
                totalAmountDue: { $sum: '$amountDue' },
                count: { $sum: 1 }
            }
        }
    ]);

    const monthlySummary = await TaxReturn.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: { month: '$month', year: '$year' },
                totalTransAmount: { $sum: '$transactionAmount' },
                totalWHT: { $sum: '$wht' },
                totalVAT: { $sum: '$vat' },
                totalAmountDue: { $sum: '$amountDue' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': -1, '_id.month': 1 } }
    ]);

    const quarterlySummary = await TaxReturn.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: { quarter: '$quarter', year: '$year' },
                totalTransAmount: { $sum: '$transactionAmount' },
                totalWHT: { $sum: '$wht' },
                totalVAT: { $sum: '$vat' },
                totalAmountDue: { $sum: '$amountDue' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': -1, '_id.quarter': 1 } }
    ]);

    res.status(200).json({
        responseCode: "00",
        responseMessage: "Summary retrieved successfully",
        responseData: {
            overall: summary[0] || {
                totalTransAmount: 0,
                totalWHT: 0,
                totalVAT: 0,
                totalAmountDue: 0,
                count: 0
            },
            monthly: monthlySummary,
            quarterly: quarterlySummary
        }
    });
});