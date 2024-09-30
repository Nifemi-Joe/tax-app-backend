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
		volume: Number,
		unitfee_usd: Number,
		totalfee_usd: Number,
		usd_ngn_rate: Number,
		totalfee_ngn: Number,
	}],
	serviceTotalFeeUsd: Number,
	serviceTotalFeeNgn: Number
});

// Role Schema for OUTSOURCING invoices
const RoleSchema = new Schema({
	count: Number,
	unit_fee: Number,
	total_fee: Number,
	name: String
});

// Service Schema for OTHER_INVOICES
const OtherInvoiceServiceSchema = new Schema({
	serviceid: String,
	servicename: String,
	servicedescription: String,
	trans_Count: Number,
	unit_Fee: Number,
	total_fee: Number
});

const InvoiceSchema = new Schema({
	invoiceNo: { type: String, required: true, unique: true },
	referenceNumber: { type: String, required: true },
	clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
	transactionDate: { type: Date, required: true },
	transactionDueDate: { type: Date, required: true },
	amountPaid: { type: Number, required: true, default: 0 },
	amountDue: { type: Number, required: true },
	status: { type: String, enum: ['Pending', 'Paid', 'Overdue'], required: true },
	invoiceType: { type: String, enum: ['ACS_RBA', 'OUTSOURCING', 'OTHER_INVOICES'], required: true },
	companyName: { type: String, required: true },
	service1: ServiceSchema,
	companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true }, // Belongs to a company
	roles: [RoleSchema],
	service2: ServiceSchema,
	totalInvoiceFee_usd: { type: Number },
	totalInvoiceFee_ngn: { type: Number },
	vat: { type: Number },
	totalInvoiceFeePlusVat_usd: { type: Number },
	totalInvoiceFeePlusVat_ngn: { type: Number },
	rateDate: { type: Date },
	accountName: { type: String },
	accountNumber: { type: String },
	bankName: { type: String },
	currency: { type: String, default: "NGN" },
	taxDetailsName: { type: String },
	taxDetailsVatNumber: { type: String }
}, { timestamps: true });

const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;
