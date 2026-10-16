const mongoose = require('mongoose');
const { Schema } = mongoose;

const taxReturnSchema = new Schema({
    transDate: {
        type: Date,
        required: [true, 'Transaction date is required'],
        default: Date.now
    },
    companyName: {
        type: String,
        required: [true, 'Company name is required'],
        trim: true,
        minlength: [2, 'Company name must be at least 2 characters long'],
        maxlength: [200, 'Company name must not exceed 200 characters']
    },
    transactionAmount: {
        type: Number,
        required: [true, 'Transaction amount is required'],
        min: [0, 'Transaction amount cannot be negative']
    },
    whtRate: {
        type: Number,
        required: [true, 'WHT rate is required'],
        min: [0, 'WHT rate cannot be negative'],
        max: [100, 'WHT rate cannot exceed 100%'],
        default: 5
    },
    wht: {
        type: Number,
        default: 0
    },
    vatRate: {
        type: Number,
        default: 7.5
    },
    vat: {
        type: Number,
        default: 0
    },
    amountDue: {
        type: Number,
        default: 0
    },
    month: {
        type: String
    },
    year: {
        type: Number
    },
    quarter: {
        type: String,
        enum: ['Q1', 'Q2', 'Q3', 'Q4']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Created by is required']
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reasonForUpdate: {
        type: String
    },
    status: {
        type: String,
        enum: ['active', 'deleted', 'pending'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save middleware to calculate WHT, VAT, and Amount Due
taxReturnSchema.pre('save', function(next) {
    // Calculate WHT = WHT Rate * Transaction Amount
    this.wht = (this.whtRate / 100) * this.transactionAmount;

    // Calculate VAT = 7.5% * Transaction Amount
    this.vat = (this.vatRate / 100) * this.transactionAmount;

    // Calculate Amount Due = Transaction Amount - WHT + VAT
    this.amountDue = this.transactionAmount - this.wht + this.vat;

    // Set month and year from transDate
    const date = new Date(this.transDate);
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    this.month = months[date.getMonth()];
    this.year = date.getFullYear();

    // Set quarter based on month
    const monthNum = date.getMonth() + 1;
    if (monthNum >= 1 && monthNum <= 3) this.quarter = 'Q1';
    else if (monthNum >= 4 && monthNum <= 6) this.quarter = 'Q2';
    else if (monthNum >= 7 && monthNum <= 9) this.quarter = 'Q3';
    else this.quarter = 'Q4';

    // Format to 2 decimal places
    this.wht = Number(this.wht.toFixed(2));
    this.vat = Number(this.vat.toFixed(2));
    this.amountDue = Number(this.amountDue.toFixed(2));
    this.transactionAmount = Number(this.transactionAmount.toFixed(2));

    this.updatedAt = Date.now();
    next();
});

// Pre-update middleware for findOneAndUpdate
taxReturnSchema.pre('findOneAndUpdate', function(next) {
    const update = this.getUpdate();

    if (update.transactionAmount !== undefined || update.whtRate !== undefined) {
        const transactionAmount = update.transactionAmount || this._update.$set?.transactionAmount;
        const whtRate = update.whtRate || this._update.$set?.whtRate || 5;
        const vatRate = update.vatRate || 7.5;

        if (transactionAmount) {
            update.wht = Number(((whtRate / 100) * transactionAmount).toFixed(2));
            update.vat = Number(((vatRate / 100) * transactionAmount).toFixed(2));
            update.amountDue = Number((transactionAmount - update.wht + update.vat).toFixed(2));
        }
    }

    if (update.transDate) {
        const date = new Date(update.transDate);
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        update.month = months[date.getMonth()];
        update.year = date.getFullYear();

        const monthNum = date.getMonth() + 1;
        if (monthNum >= 1 && monthNum <= 3) update.quarter = 'Q1';
        else if (monthNum >= 4 && monthNum <= 6) update.quarter = 'Q2';
        else if (monthNum >= 7 && monthNum <= 9) update.quarter = 'Q3';
        else update.quarter = 'Q4';
    }

    update.updatedAt = Date.now();
    next();
});

const TaxReturn = mongoose.model('TaxReturn', taxReturnSchema);
module.exports = TaxReturn;