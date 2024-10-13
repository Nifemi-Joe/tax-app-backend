// routes/company.js
const express = require("express");
const Company = require("../models/Company");
const {protect} = require("../middlewares/authMiddleware");
const router = express.Router();

// Create a new company
router.post("/", protect, async (req, res) => {
	const { name } = req.body;
	const body = req.body;

	try {
		// Create a new company
		const company = await Company.create({
			...body,
			adminId: req.user.id,
			createdBy: req.user.id,
		});

		// Update the user's companyId field with the created company's ID
		await User.findByIdAndUpdate(req.user.id, { companyId: company._id });

		// Send a response with the newly created company details
		res.status(201).json({
			responseCode: "00",
			responseMessage: "Company created successfully",
			responseData: company
		});
	} catch (error) {
		// Handle error
		res.status(400).json({ message: "Error creating company", error });
	}
});

// Get user company (if exists)
router.get("/read-by-id/:id", protect, async (req, res) => {
	try {
		const company = await Company.findOne({ adminId: req.user.id }).populate("clients taxes employees");
		if (!company) {
			return res.status(404).json({ responseCode: "00" , responseMessage: "No company found. Please create one." });
		}
		res.json({responseCode: "00" , responseMessage: "Completed successfully", responseData: company});
	} catch (error) {
		res.status(500).json({ responseCode: "22" , responseMessage: "Server error", error });
	}
});

// Get user company (if exists)
router.get("/read", protect, async (req, res) => {
	try {
		const company = await Company.find();
		if (!company) {
			return res.status(404).json({ responseCode: "00" , responseMessage: "No company found. Please create one." });
		}
		res.json(company);
	} catch (error) {
		res.status(500).json({ responseCode: "00" , responseMessage: "Server error", error });
	}
});

module.exports = router;
