const mongoose = require('mongoose');
const { Schema } = mongoose;

// Service Schema for ACS_RBA invoices
const ServiceSchema = new Schema({
	id: String,
	description: String,
	date: Date,
	transactions: [{
		id: String,
		description: String,
		volume: {
			type: Number,
			set: (value) => parseFloat(value.toFixed(2)) // Ensure volume is fixed to 2 decimal places
		},
		unitfee_usd: {
			type: Number,
			set: (value) => parseFloat(value.toFixed(2)) // Ensure unitfee_usd is fixed to 2 decimal places
		},
		totalfee_usd: {
			type: Number,
			set: (value) => parseFloat(value.toFixed(2)) // Ensure totalfee_usd is fixed to 2 decimal places
		},
		usd_ngn_rate: {
			type: Number,
			set: (value) => parseFloat(value.toFixed(2)) // Ensure usd_ngn_rate is fixed to 2 decimal places
		},
		totalfee_ngn: {
			type: Number,
			set: (value) => parseFloat(value.toFixed(2)) // Ensure totalfee_ngn is fixed to 2 decimal places
		},
	}],
	serviceTotalFeeUsd: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure serviceTotalFeeUsd is fixed to 2 decimal places
	},
	serviceTotalFeeNgn: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure serviceTotalFeeNgn is fixed to 2 decimal places
	}
});

// Role Schema for OUTSOURCING invoices
const RoleSchema = new Schema({
	count: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure count is fixed to 2 decimal places
	},
	unit_fee: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure unit_fee is fixed to 2 decimal places
	},
	total_fee: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure total_fee is fixed to 2 decimal places
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
		set: (value) => parseFloat(value.toFixed(2)) // Ensure trans_Count is fixed to 2 decimal places
	},
	unit_Fee: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure unit_Fee is fixed to 2 decimal places
	},
	total_fee: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure total_fee is fixed to 2 decimal places
	}
});

const InvoiceSchema = new Schema({
	invoiceNo: { type: String, required: true, unique: true },
	referenceNumber: { type: String, required: true },
	clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
	transactionDate: { type: Date, required: true },
	transactionDueDate: { type: Date, required: true },
	amountInWords: String,
	amountPaid: {
		type: Number,
		required: true,
		default: 0,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure amountPaid is fixed to 2 decimal places
	},
	amountDue: {
		type: Number,
		required: true,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure amountDue is fixed to 2 decimal places
	},
	status: { type: String, enum: ['pending', 'paid', 'overdue', 'unpaid'], required: true },
	invoiceType: { type: String, enum: ['ACS_RBA', 'OUTSOURCING', 'OTHER_INVOICES'], required: true },
	companyName: { type: String, required: true },
	service1: {
		type: ServiceSchema,
		required: [true, 'Service1 is required'],
		default: {}
	},
	roles: [RoleSchema],
	service2: ServiceSchema,
	totalInvoiceFee_usd: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure totalInvoiceFee_usd is fixed to 2 decimal places
	},
	totalInvoiceFee_ngn: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure totalInvoiceFee_ngn is fixed to 2 decimal places
	},
	vat: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure vat is fixed to 2 decimal places
	},
	totalInvoiceFeePlusVat_usd: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure totalInvoiceFeePlusVat_usd is fixed to 2 decimal places
	},
	totalInvoiceFeePlusVat_ngn: {
		type: Number,
		set: (value) => parseFloat(value.toFixed(2)) // Ensure totalInvoiceFeePlusVat_ngn is fixed to 2 decimal places
	},
	rateDate: { type: Date },
	accountName: { type: String },
	accountNumber: { type: String },
	bankName: { type: String },
	currency: { type: String, default: "NGN" },
	taxDetailsName: { type: String },
	taxDetailsVatNumber: { type: String },
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

const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;
