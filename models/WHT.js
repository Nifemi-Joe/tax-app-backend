const mongoose = require('mongoose');

const WHTSchema = new mongoose.Schema({
    whtId: {
        type: String,
        required: true,
        unique: true
    },
    // Support both invoice and expense sources
    sourceType: {
        type: String,
        enum: ['invoice', 'expense'],
        required: true
    },
    sourceId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'sourceModel',
        required: true
    },
    sourceModel: {
        type: String,
        enum: ['Invoice', 'Expense'],
        required: true
    },
    // For backward compatibility with existing invoice WHT
    invoiceNo: {
        type: String
    },
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
    },
    // Transaction details
    transDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    companyName: {
        type: String,
        required: true,
        trim: true
    },
    totalTransactionAmount: {
        type: Number,
        required: true,
        set: (value) => parseFloat(value.toFixed(2))
    },
    // WHT calculations
    whtRate: {
        type: Number,
        required: true,
        default: 5
    },
    whtAmount: {
        type: Number,
        required: true,
        set: (value) => parseFloat(value.toFixed(2))
    },
    // VAT calculations
    vatRate: {
        type: Number,
        default: 7.5
    },
    vatAmount: {
        type: Number,
        required: true,
        set: (value) => parseFloat(value.toFixed(2))
    },
    // Amount Due = Transaction Amount - WHT + VAT
    amountDue: {
        type: Number,
        required: true,
        set: (value) => parseFloat(value.toFixed(2))
    },
    // Period information for reporting
    month: {
        type: String
    },
    monthNumber: {
        type: Number
    },
    year: {
        type: Number
    },
    quarter: {
        type: String,
        enum: ['Q1', 'Q2', 'Q3', 'Q4']
    },
    // Description
    description: {
        type: String,
        trim: true
    },
    // Status and metadata
    status: {
        type: String,
        default: "unpaid",
        enum: ["paid", "unpaid", "deleted"]
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date
    }
});

// Pre-save middleware to calculate values and set period info
WHTSchema.pre('save', function(next) {
    // Calculate WHT Amount
    this.whtAmount = parseFloat(((this.whtRate / 100) * this.totalTransactionAmount).toFixed(2));

    // Calculate VAT Amount
    this.vatAmount = parseFloat(((this.vatRate / 100) * this.totalTransactionAmount).toFixed(2));

    // Calculate Amount Due (Transaction Amount - WHT + VAT)
    this.amountDue = parseFloat((this.totalTransactionAmount - this.whtAmount + this.vatAmount).toFixed(2));

    // Set month, year, and quarter from transDate
    const date = new Date(this.transDate);
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    this.month = months[date.getMonth()];
    this.monthNumber = date.getMonth() + 1;
    this.year = date.getFullYear();

    // Set quarter
    const monthNum = date.getMonth();
    if (monthNum >= 0 && monthNum <= 2) this.quarter = 'Q1';
    else if (monthNum >= 3 && monthNum <= 5) this.quarter = 'Q2';
    else if (monthNum >= 6 && monthNum <= 8) this.quarter = 'Q3';
    else this.quarter = 'Q4';

    // Set updatedAt
    this.updatedAt = new Date();

    next();
});

// Pre-update middleware
WHTSchema.pre('findOneAndUpdate', function(next) {
    const update = this.getUpdate();

    if (update.totalTransactionAmount !== undefined || update.whtRate !== undefined || update.vatRate !== undefined) {
        const transAmount = update.totalTransactionAmount || this._update.totalTransactionAmount;
        const whtRate = update.whtRate !== undefined ? update.whtRate : 5;
        const vatRate = update.vatRate !== undefined ? update.vatRate : 7.5;

        update.whtAmount = parseFloat(((whtRate / 100) * transAmount).toFixed(2));
        update.vatAmount = parseFloat(((vatRate / 100) * transAmount).toFixed(2));
        update.amountDue = parseFloat((transAmount - update.whtAmount + update.vatAmount).toFixed(2));
    }

    if (update.transDate) {
        const date = new Date(update.transDate);
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        update.month = months[date.getMonth()];
        update.monthNumber = date.getMonth() + 1;
        update.year = date.getFullYear();

        const monthNum = date.getMonth();
        if (monthNum >= 0 && monthNum <= 2) update.quarter = 'Q1';
        else if (monthNum >= 3 && monthNum <= 5) update.quarter = 'Q2';
        else if (monthNum >= 6 && monthNum <= 8) update.quarter = 'Q3';
        else update.quarter = 'Q4';
    }

    update.updatedAt = new Date();

    next();
});

// Indexes for efficient querying
WHTSchema.index({ sourceType: 1, status: 1 });
WHTSchema.index({ year: 1, month: 1 });
WHTSchema.index({ quarter: 1, year: 1 });
WHTSchema.index({ transDate: 1 });
WHTSchema.index({ sourceId: 1 });
WHTSchema.index({ whtId: 1 });

// Static method to generate unique WHT ID
WHTSchema.statics.generateWHTId = async function() {
    const count = await this.countDocuments();
    const timestamp = Date.now().toString().slice(-6);
    return `WHT-${timestamp}-${(count + 1).toString().padStart(5, '0')}`;
};

module.exports = mongoose.model('WHT', WHTSchema);