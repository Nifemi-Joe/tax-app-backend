// routes/companyRoutes.js

const express = require('express');
const { registerCompany, loginUser, changePassword, addEmployee } = require('../controllers/companyController');
const { protect, admin } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/errorMiddleware');

const router = express.Router();

// Public Routes
router.post('/register', registerCompany);
router.post('/login', loginUser);

// Protected Routes
router.put('/change-password', protect, changePassword);

// Admin Routes
router.post('/add-employee', protect, admin, addEmployee);

module.exports = router;
