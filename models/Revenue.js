const mongoose = require('mongoose');
const { Schema } = mongoose;

// Service Schema for ACS_RBA invoices
const ServiceSchema = new Schema({
    id: String,
    description: String,
    date: Date,
    name: String,
    transactions: [{
        id: String,
        description: String,
        volume: {
            type: Number,
            set: (value) => parseFloat(value.toFixed(2))
        },
        unitfee_usd: {
            type: Number,
            set: (value) => parseFloat(value.toFixed(3))
        },
        totalfee_usd: {
            type: Number,
            set: (value) => parseFloat(value.toFixed(2))
        },
        usd_ngn_rate: {
            type: Number,
            set: (value) => parseFloat(value.toFixed(2))
        },
        totalfee_ngn: {
            type: Number,
            set: (value) => parseFloat(value.toFixed(2))
        },
    }],
    serviceTotalFeeUsd: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(2))
    },
    serviceTotalFeeNgn: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(2))
    }
}, { _id: false });

// Role Schema for OUTSOURCING invoices
const RoleSchema = new Schema({
    count: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(2))
    },
    unit_fee: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    total_fee: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(2))
    },
    name: String
}, { _id: false });

// Service Schema for OTHER_INVOICES
const OtherInvoiceServiceSchema = new Schema({
    serviceid: String,
    servicename: String,
    servicedescription: String,
    trans_Count: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(2))
    },
    unit_Fee: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    total_fee: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(2))
    }
}, { _id: false });

const InvoiceSchema = new Schema({
    invoiceNo: {
        type: String,
        required: true,
        unique: true
    },
    referenceNumber: {
        type: String,
        required: true
    },
    clientId: {
        type: Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    transactionDate: {
        type: Date,
        required: true
    },
    transactionDueDate: {
        type: Date
    },
    period: {
        type: String,
        enum: ["monthly", "quarterly", "annually", "one-off"],
        default: "monthly"
    },
    amountInWords: String,
    cbnratedate: {
        type: Date,
        required: true,
        default: Date.now
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    rate: Number,
    amountPaid: {
        type: Number,
        required: true,
        default: 0,
        set: (value) => parseFloat(value.toFixed(3))
    },
    paymentDate: Date,
    amountDue: {
        type: Number,
        required: true,
        set: (value) => parseFloat(value.toFixed(3))
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'overdue', 'unpaid', 'rejected', 'approved'],
        required: true,
        index: true
    },
    reasonForRejection: String,
    invoiceType: {
        type: String,
        enum: ['ACS_RBA', 'OUTSOURCING', 'OTHER_INVOICES', 'RBA_ACS', 'ACS_RENTAL', 'RBA_RENTAL', 'CONSULTATION', 'TRAINING', 'LICENSE'],
        required: true
    },
    templateType: {
        type: String,
        enum: ['normal', 'fcmb'],
        default: 'normal'
    },
    companyName: {
        type: String,
        required: true
    },
    service1: ServiceSchema,
    roles: [RoleSchema],
    service2: ServiceSchema,
    otherInvoiceServices: [OtherInvoiceServiceSchema],
    totalInvoiceFee_usd: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    totalInvoiceFee_ngn: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    vat: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    wht: {
        type: Number,
        default: 10,
        set: (value) => parseFloat(value.toFixed(3)),
        index: true
    },
    totalInvoiceFeePlusVat_usd: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    totalInvoiceFeePlusVat_ngn: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    accountName: {
        type: String
    },
    accountNumber: {
        type: String
    },
    bankName: {
        type: String
    },
    includeNairaAmount: {
        type: Boolean,
        default: false
    },
    taxOption: {
        type: Boolean,
        default: true
    },
    currency: {
        type: String,
        default: "NGN"
    },
    taxDetailsName: {
        type: String
    },
    taxDetailsVatNumber: {
        type: String
    },
    // FCMB-specific fields
    wibmoAmount: {
        type: Number,
        set: (value) => value ? parseFloat(value.toFixed(3)) : null
    },
    wibmoAmountInWords: {
        type: String
    },
    gsjxAmount: {
        type: Number,
        set: (value) => value ? parseFloat(value.toFixed(3)) : null
    },
    gsjxAmountInWords: {
        type: String
    },
    createdBy: {
        type: String,
        required: [true, 'Invoice Created By is required']
    },
    updatedBy: {
        type: String
    },
    deletedBy: {
        type: String
    }
}, {
    timestamps: true
});

// ============================================================
// INDEX DEFINITIONS (Removed duplicates)
// ============================================================
// Only use schema.index() method, NOT both index: true and schema.index()

InvoiceSchema.index({ invoiceNo: 1 }, { unique: true });
InvoiceSchema.index({ clientId: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ wht: 1 });
InvoiceSchema.index({ transactionDate: 1 });
InvoiceSchema.index({ createdAt: 1 });
InvoiceSchema.index({ invoiceType: 1 });
InvoiceSchema.index({ companyName: 1 });

// Compound indexes for common queries
InvoiceSchema.index({ clientId: 1, status: 1 });
InvoiceSchema.index({ clientId: 1, transactionDate: -1 });
InvoiceSchema.index({ status: 1, transactionDueDate: 1 });

// ============================================================
// PRE-SAVE MIDDLEWARE
// ============================================================
InvoiceSchema.pre('save', function (next) {
    // Set transaction due date to 14 days after transaction date
    if (this.transactionDate) {
        this.transactionDueDate = new Date(this.transactionDate);
        this.transactionDueDate.setDate(this.transactionDueDate.getDate() + 14);
    }

    // Update amountDue based on status
    if (this.status === 'paid') {
        this.amountDue = 0;
    } else if (this.status === 'partially_paid') {
        this.amountDue = this.totalInvoiceFeePlusVat_ngn - this.amountPaid;
    }

    next();
});

// ============================================================
// INSTANCE METHODS
// ============================================================
/**
 * Mark invoice as paid
 */
InvoiceSchema.methods.markAsPaid = function (paymentAmount, paymentDate) {
    this.status = 'paid';
    this.amountPaid = paymentAmount;
    this.paymentDate = paymentDate || new Date();
    this.amountDue = 0;
    return this.save();
};

/**
 * Mark invoice as overdue
 */
InvoiceSchema.methods.markAsOverdue = function () {
    if (this.status !== 'paid') {
        this.status = 'overdue';
    }
    return this.save();
};

/**
 * Calculate remaining balance
 */
InvoiceSchema.methods.getRemainingBalance = function () {
    return this.totalInvoiceFeePlusVat_ngn - this.amountPaid;
};

/**
 * Check if invoice is overdue
 */
InvoiceSchema.methods.isOverdue = function () {
    if (this.status === 'paid') {
        return false;
    }
    return new Date() > this.transactionDueDate;
};

// ============================================================
// STATIC METHODS
// ============================================================
/**
 * Find all overdue invoices and mark them
 */
InvoiceSchema.statics.markOverdueInvoices = async function () {
    const overdueInvoices = await this.find({
        status: { $ne: 'paid' },
        transactionDueDate: { $lt: new Date() }
    });

    for (const invoice of overdueInvoices) {
        if (invoice.status !== 'overdue') {
            invoice.status = 'overdue';
            await invoice.save();
        }
    }

    return overdueInvoices.length;
};

/**
 * Get invoice summary for a client
 */
InvoiceSchema.statics.getClientSummary = async function (clientId) {
    const summary = await this.aggregate([
        {
            $match: { clientId: mongoose.Types.ObjectId(clientId) }
        },
        {
            $group: {
                _id: '$clientId',
                totalInvoices: { $sum: 1 },
                totalAmount: { $sum: '$totalInvoiceFeePlusVat_ngn' },
                totalPaid: { $sum: '$amountPaid' },
                totalDue: { $sum: '$amountDue' },
                paidCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                },
                overdueCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] }
                }
            }
        }
    ]);

    return summary[0] || null;
};

/**
 * Get invoices by status
 */
InvoiceSchema.statics.getByStatus = async function (status, limit = 50) {
    return this.find({ status })
        .sort({ transactionDate: -1 })
        .limit(limit)
        .populate('clientId');
};

/**
 * Get invoices due within N days
 */
InvoiceSchema.statics.getDueWithinDays = async function (days = 7) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);

    return this.find({
        status: { $ne: 'paid' },
        transactionDueDate: {
            $gte: new Date(),
            $lte: dueDate
        }
    })
        .sort({ transactionDueDate: 1 })
        .populate('clientId');
};

// ============================================================
// CREATE AND EXPORT MODEL
// ============================================================
const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;