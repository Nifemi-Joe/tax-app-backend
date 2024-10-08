// routes/company.js
const express = require("express");
const Company = require("../models/Company");
const {protect} = require("../middlewares/authMiddleware");
const router = express.Router();

// Create a new company
router.post("/", protect, async (req, res) => {
	const { name } = req.body;

	try {
		const company = await Company.create({ name, adminId: req.user.id });
		res.status(201).json({ message: "Company created successfully", company });
	} catch (error) {
		res.status(400).json({ message: "Error creating company", error });
	}
});

// Get user company (if exists)
router.get("/read-by-id/:id", protect, async (req, res) => {
	try {
		const company = await Company.findOne({ adminId: req.user.id }).populate("clients taxes employees");
		if (!company) {
			return res.status(404).json({ message: "No company found. Please create one." });
		}
		res.json(company);
	} catch (error) {
		res.status(500).json({ message: "Server error", error });
	}
});

// Get user company (if exists)
router.get("/read", protect, async (req, res) => {
	try {
		const company = await Company.find();
		if (!company) {
			return res.status(404).json({ message: "No company found. Please create one." });
		}
		res.json(company);
	} catch (error) {
		res.status(500).json({ message: "Server error", error });
	}
});

module.exports = router;
