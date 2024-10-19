const express = require('express');
const router = express.Router();
const {
	createEmployee,
	updateEmployee,
	printEmployeeDetails,
	sendEmailToEmployee,
	markEmployeeInactive,
	getActiveEmployees,
	getInactiveEmployees,
	getAllEmployees,
	softDeleteEmployee
} = require('../controllers/employeeController');

// Middleware for authorization (example)
const authMiddleware = require('../middlewares/authMiddleware');
const {validateObjectId} = require('../middlewares/errorMiddleware');
const {authorize, authorizePermissions, protect} = require("../middlewares/authMiddleware");

// Route to create a new employee
router.post('/create', protect, authorize('superadmin', 'admin', 'frontOffice'), authorizePermissions('create-employee'),createEmployee);

// Route to update employee details
router.put('/update/:id', protect,authorize('superadmin', 'admin', 'backOffice'), authorizePermissions('update-employee'),  validateObjectId('id'), updateEmployee);

// Route to print employee details
router.get('/read-by-id/:id/', protect,validateObjectId('id'), printEmployeeDetails);

// Route to send an email to an employee
router.post('/send-email/:id/', protect,validateObjectId('id'), sendEmailToEmployee);

// Route to mark an employee as inactive
router.put('/inactive/:id/', protect,validateObjectId('id'), markEmployeeInactive);

// Route to get a list of active employees
router.get('/read/active', protect,getActiveEmployees);

// Route to get a list of inactive employees
router.get('/read/inactive', protect,getInactiveEmployees);

// Route to get a list of all employees
router.get('/read', protect,getAllEmployees);


router.delete('/delete/:id', protect,authorize('superadmin', 'admin'), authorizePermissions('delete-employee'),  validateObjectId('id'), softDeleteEmployee);

module.exports = router;
