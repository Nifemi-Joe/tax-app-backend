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
	getAllEmployees
} = require('../controllers/employeeController');

// Middleware for authorization (example)
const authMiddleware = require('../middlewares/authMiddleware');

// Route to create a new employee
router.post('/create', createEmployee);

// Route to update employee details
router.put('/update/:id', updateEmployee);

// Route to print employee details
router.get('/read-by-id/:id/', printEmployeeDetails);

// Route to send an email to an employee
router.post('/send-email/:id/', sendEmailToEmployee);

// Route to mark an employee as inactive
router.put('/inactive/:id/', markEmployeeInactive);

// Route to get a list of active employees
router.get('/read/active', getActiveEmployees);

// Route to get a list of inactive employees
router.get('/read/inactive', getInactiveEmployees);

// Route to get a list of all employees
router.get('/read', getAllEmployees);

module.exports = router;
