const mongoose = require('mongoose');

// Expense Schema
const expenseSchema = new mongoose.Schema(
    {
        description: {
            type: String,
            trim: true,
            maxlength: [5000, 'Description cannot be more than 5000 characters'],
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
        },
        amount: {
            type: Number,
            required: [true, 'Amount is required'],
            min: [0, 'Amount must be a positive number'],
        },
        unitPrice: {
            type: Number,
            min: [0, 'Unit price must be a positive number'],
        },
        quantity: {
            type: Number,
            default: 1,
            min: [1, 'Quantity must be at least 1'],
        },
        status: {
            type: String,
            required: true,
            default: "created",
            enum: ["created", "approved", "deleted"]
        },
        category: {
            type: String,
            enum: [
                'Travelling',
                'Office Confectioneries',
                'Welfare',
                'Office Equipment',
                'Vehicles',
                'Power Generating Equipment',
                'Others',
                'Meals',
                'Entertainment',
                'Utilities',
                'Other',
                'Salaries',
                'Furnitures',
                'Rent',
                'Fueling',
                'Electricity',
                'Corporate Social Responsibility',
                'Training',
                'Consulting Services',
                'Software Acquisition',
            ],
            default: 'Others',
        },
        date: {
            type: Date,
            required: [true, 'Date is required'],
            default: Date.now,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User ID is required'],
        },
        receipt: {
            type: String,
            trim: true,
            maxlength: [2000000, 'Receipt URL cannot be more than 2000000 characters'],
        },
        image: {
            type: String,
            trim: true,
            maxlength: [2000000, 'Image cannot be more than 2000000 characters'],
        },
        // WHT Related Fields
        enableWHT: {
            type: Boolean,
            default: false,
        },
        companyName: {
            type: String,
            trim: true,
            maxlength: [500, 'Company name cannot be more than 500 characters'],
        },
        whtRate: {
            type: Number,
            min: [0, 'WHT rate must be a positive number'],
            max: [100, 'WHT rate cannot exceed 100'],
            default: null,
        },
        vatRate: {
            type: Number,
            min: [0, 'VAT rate must be a positive number'],
            max: [100, 'VAT rate cannot exceed 100'],
            default: null,
        },
        whtAmount: {
            type: Number,
            min: [0, 'WHT amount must be a positive number'],
            default: null,
        },
        vatAmount: {
            type: Number,
            min: [0, 'VAT amount must be a positive number'],
            default: null,
        },
        amountDue: {
            type: Number,
            min: [0, 'Amount due must be a positive number'],
            default: null,
        },
        createdBy: {
            type: String,
            required: [true, 'Expense Created By is required'],
        },
        updatedBy: {
            type: String,
        },
        deletedBy: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

// Middleware to format amount and calculate WHT values before saving
expenseSchema.pre('save', function (next) {
    if (this.amount !== undefined) {
        this.amount = Number(this.amount.toFixed(2));
    }

    // Calculate WHT values if WHT is enabled
    if (this.enableWHT && this.amount) {
        const whtRate = this.whtRate || 5;
        const vatRate = this.vatRate || 7.5;

        this.whtAmount = Number(((whtRate / 100) * this.amount).toFixed(2));
        this.vatAmount = Number(((vatRate / 100) * this.amount).toFixed(2));
        this.amountDue = Number((this.amount - this.whtAmount + this.vatAmount).toFixed(2));
    } else if (!this.enableWHT) {
        // Clear WHT values if WHT is disabled
        this.whtAmount = null;
        this.vatAmount = null;
        this.amountDue = null;
        this.companyName = null;
        this.whtRate = null;
        this.vatRate = null;
    }

    next();
});

// Pre-update middleware
expenseSchema.pre('findOneAndUpdate', function (next) {
    const update = this.getUpdate();

    if (update.amount !== undefined) {
        update.amount = Number(parseFloat(update.amount).toFixed(2));
    }

    // Calculate WHT values if WHT is enabled
    if (update.enableWHT && update.amount) {
        const whtRate = update.whtRate || 5;
        const vatRate = update.vatRate || 7.5;

        update.whtAmount = Number(((whtRate / 100) * update.amount).toFixed(2));
        update.vatAmount = Number(((vatRate / 100) * update.amount).toFixed(2));
        update.amountDue = Number((update.amount - update.whtAmount + update.vatAmount).toFixed(2));
    } else if (update.enableWHT === false) {
        // Clear WHT values if WHT is disabled
        update.whtAmount = null;
        update.vatAmount = null;
        update.amountDue = null;
        update.companyName = null;
        update.whtRate = null;
        update.vatRate = null;
    }

    update.updatedAt = new Date();
    next();
});

// Define a method to get formatted expense data
expenseSchema.methods.getFormattedExpense = function () {
    return {
        id: this._id,
        description: this.description || 'No description provided',
        amount: this.amount.toFixed(2),
        category: this.category,
        date: this.date.toISOString().split('T')[0],
        receipt: this.receipt || 'No receipt provided',
        enableWHT: this.enableWHT,
        companyName: this.companyName,
        whtRate: this.whtRate,
        vatRate: this.vatRate,
        whtAmount: this.whtAmount,
        vatAmount: this.vatAmount,
        amountDue: this.amountDue,
    };
};

// Virtual for calculating totals on the fly
expenseSchema.virtual('calculatedWHT').get(function () {
    if (!this.enableWHT || !this.amount) return null;
    const whtRate = this.whtRate || 5;
    return Number(((whtRate / 100) * this.amount).toFixed(2));
});

expenseSchema.virtual('calculatedVAT').get(function () {
    if (!this.enableWHT || !this.amount) return null;
    const vatRate = this.vatRate || 7.5;
    return Number(((vatRate / 100) * this.amount).toFixed(2));
});

expenseSchema.virtual('calculatedAmountDue').get(function () {
    if (!this.enableWHT || !this.amount) return this.amount;
    const wht = this.calculatedWHT || 0;
    const vat = this.calculatedVAT || 0;
    return Number((this.amount - wht + vat).toFixed(2));
});

// Ensure virtuals are included when converting to JSON
expenseSchema.set('toJSON', { virtuals: true });
expenseSchema.set('toObject', { virtuals: true });

// Indexes
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ enableWHT: 1 });
expenseSchema.index({ companyName: 'text' });

module.exports = mongoose.model('Expense', expenseSchema);