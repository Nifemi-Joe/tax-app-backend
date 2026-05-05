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
});

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
});

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
});

const InvoiceSchema = new Schema({
    invoiceNo: { type: String, required: true, unique: true },
    referenceNumber: { type: String, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    transactionDate: { type: Date, required: true },
    transactionDueDate: { type: Date },
    period: {type: String, enum: ["monthly", "quarterly", "annually", "one-off"], default: "monthly"},
    amountInWords: String,
    cbnratedate: {
        type: Date,
        required: true,
        default: Date.now()
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
    status: { type: String, enum: ['pending', 'paid', 'overdue', 'unpaid', "rejected", "approved"], required: true },
    reasonForRejection: String,
    invoiceType: { type: String, enum: ['ACS_RBA', 'OUTSOURCING', 'OTHER_INVOICES', "RBA_ACS", "ACS_RENTAL", "RBA_RENTAL", "CONSULTATION", "TRAINING", "LICENSE"], required: true },
    templateType: { type: String, enum: ['normal', 'fcmb'], default: 'normal' }, // Added template type field
    companyName: { type: String, required: true },
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
        set: (value) => parseFloat(value.toFixed(3))
    },
    totalInvoiceFeePlusVat_usd: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    totalInvoiceFeePlusVat_ngn: {
        type: Number,
        set: (value) => parseFloat(value.toFixed(3))
    },
    accountName: { type: String },
    accountNumber: { type: String },
    bankName: { type: String },
    includeNairaAmount: { type: Boolean, default: false },
    taxOption: { type: Boolean, default: true },
    currency: { type: String, default: "NGN" },
    taxDetailsName: { type: String },
    taxDetailsVatNumber: { type: String },
    // FCMB-specific fields
    wibmoAmount: {
        type: Number,
        set: (value) => value ? parseFloat(value.toFixed(3)) : null
    },
    wibmoAmountInWords: { type: String },
    gsjxAmount: {
        type: Number,
        set: (value) => value ? parseFloat(value.toFixed(3)) : null
    },
    gsjxAmountInWords: { type: String },
    createdBy: {
        type: String,
        required: [true, 'Client Created By is required'],
    },
    updatedBy: {
        type: String,
    },
    deletedBy: {
        type: String,
    },
}, { timestamps: true });

InvoiceSchema.pre('save', function (next) {
    if (this.transactionDate) {
        this.transactionDueDate = new Date(this.transactionDate);
        this.transactionDueDate.setDate(this.transactionDueDate.getDate() + 14);
    }
    next();
});

const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;