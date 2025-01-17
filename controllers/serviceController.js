const Service = require('../models/Service');
const Revenue = require('../models/Revenue');
const Client = require('../models/Client');
const { generatePDF } = require('../utils/pdfGenerator');
const { sendEmail } = require('../utils/emailService');
const asyncHandler = require('express-async-handler');
const { check, validationResult } = require('express-validator');
const path = require('path');
const logAction = require("../utils/auditLogger");

// @desc    Get all services
// @route   GET /api/services
// @access  Private
exports.getAllServices = asyncHandler(async (req, res) => {
	try {
		const services = await Service.find();
		res.status(200).json({ responseCode: "00", responseMessage: "Completed successfully", responseData: services });
	} catch (error) {
		res.status(500).json({ responseCode: "00", responseMessage: 'Something went wrong', errror });
	}
});

// @desc    Get service by ID
// @route   GET /api/services/:id
// @access  Private
exports.getServiceById = asyncHandler(async (req, res) => {
	try {
		const service = await Service.findById(req.params.id).populate('client');
		if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
		res.status(200).json({ success: true, data: service });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Create a new service
// @route   POST /api/services
// @access  Private
exports.createService = asyncHandler(async (req, res) => {
	await check('serviceType', 'Service type is required').notEmpty().run(req);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	try {
		const { client, serviceType, details } = req.body;

		// Validate client existence
		const existingClient = await Client.findById(client);
		if (!existingClient) return res.status(404).json({ success: false, error: 'Client not found' });

		// Create service record
		const newService = await Service.create({ client, serviceType, details });

		// Create revenue record associated with the service
		const newRevenue = await Revenue.create({
			client,
			invoiceType: serviceType,
			details,
		});

		// Generate invoice PDF based on service type


		// Send invoice via email
		await logAction(req.user._id || "Admin", req.user.name || req.user.fistname + " " + req.user.lastname,'created_sevice', "Service Management", `Created service ${email} by ${req.user.email}`, req.body.ip )
		res.status(201).json({ responseCode: "00", responseMessage: "Completed successfully.", responseData: newService });
	} catch (error) {
		res.status(500).json({ responseCode: "22", responseMessage: "Something went wrong", error });
	}
});

// @desc    Update a service
// @route   PUT /api/services/:id
// @access  Private
exports.updateService = asyncHandler(async (req, res) => {
	try {
		const updatedService = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
		if (!updatedService) return res.status(404).json({ success: false, error: 'Service not found' });
		res.status(200).json({ success: true, data: updatedService });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Delete a service
// @route   DELETE /api/services/:id
// @access  Private
exports.deleteService = asyncHandler(async (req, res) => {
	try {
		const deletedService = await Service.findByIdAndDelete(req.params.id);
		if (!deletedService) return res.status(404).json({ success: false, error: 'Service not found' });
		res.status(200).json({ success: true, data: {} });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Generate and send service invoice PDF
// @route   POST /api/services/generateInvoice/:id
// @access  Private
exports.generateServiceInvoice = asyncHandler(async (req, res) => {
	const { id } = req.params;

	try {
		const service = await Service.findById(id).populate('client');
		if (!service) return res.status(404).json({ success: false, error: 'Service not found' });

		const invoiceHTML = `../templates/${service.serviceType.toLowerCase()}_invoice.html`; // Path to HTML template
		const invoicePDF = await generatePDF(invoiceHTML, service);

		// Send invoice via email
		await sendEmail(service.client.email, 'Your Service Invoice', 'Please find attached your service invoice.', invoicePDF);

		res.status(200).json({ success: true, message: 'Invoice generated and sent successfully' });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to generate or send invoice' });
	}
});

// @desc    Track service status
// @route   GET /api/services/trackStatus/:id
// @access  Private
exports.trackServiceStatus = asyncHandler(async (req, res) => {
	const { id } = req.params;

	try {
		const service = await Service.findById(id);
		if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
		res.status(200).json({ success: true, status: service.status });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Server Error' });
	}
});

// @desc    Send payment reminder for unpaid services
// @route   POST /api/services/sendReminder/:id
// @access  Private
exports.sendPaymentReminder = asyncHandler(async (req, res) => {
	const { id } = req.params;

	try {
		const service = await Service.findById(id).populate('client');
		if (!service) return res.status(404).json({ success: false, error: 'Service not found' });

		if (service.status === 'Paid') {
			return res.status(400).json({ success: false, message: 'Service is already paid' });
		}

		const mailOptions = {
			from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
			to: service.client.email,
			subject: `Payment Reminder for Service ${service._id}`,
			text: `Dear ${service.client.name},\n\nThis is a reminder that your service payment is due.\n\nPlease ensure timely payment to avoid penalties.\n\nThank you.`,
		};

		await sendEmail(mailOptions.to, mailOptions.subject, mailOptions.text);
		res.status(200).json({ success: true, message: 'Payment reminder sent successfully' });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to send payment reminder' });
	}
});

// @desc    Generate and send payment receipt for a paid service
// @route   POST /api/services/generateReceipt/:id
// @access  Private
exports.generateServiceReceipt = asyncHandler(async (req, res) => {
	const { id } = req.params;

	try {
		const service = await Service.findById(id).populate('client');
		if (!service) return res.status(404).json({ success: false, error: 'Service not found' });

		if (service.status !== 'Paid') {
			return res.status(400).json({ success: false, message: 'Cannot generate receipt for an unpaid service' });
		}

		const doc = new jsPDF();
		doc.text(`Receipt for Service ID: ${service._id}`, 10, 10);
		doc.text(`Client: ${service.client.name}`, 10, 20);
		doc.text(`Amount Paid: ${service.amount}`, 10, 30);
		doc.text(`Payment Date: ${new Date().toLocaleDateString()}`, 10, 40);

		const filePath = path.join(__dirname, '../receipts', `receipt_${service._id}.pdf`);
		doc.save(filePath);

		const mailOptions = {
			from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
			to: service.client.email,
			subject: `Payment Receipt for Service ${service._id}`,
			text: `Dear ${service.client.name},\n\nAttached is the payment receipt for your service with ID ${service._id}.\n\nThank you for your payment.`,
			attachments: [{ path: filePath }],
		};

		await sendEmail(mailOptions.to, mailOptions.subject, mailOptions.text, mailOptions.attachments);
		res.status(200).json({ success: true, message: 'Receipt generated and sent successfully' });
	} catch (error) {
		res.status(500).json({ success: false, error: 'Failed to generate or send receipt' });
	}
});
