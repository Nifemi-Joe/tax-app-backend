const express = require('express');
const router = express.Router();
const {
	createClient,
	updateClient,
	printClientDetails,
	sendEmailToClient,
	markClientInactive,
	getActiveClients,
	getInactiveClients,
	getAllClients,
	softDelete
} = require('../controllers/clientController');

// Middleware for authorization (example)
const authMiddleware = require('../middlewares/authMiddleware');

// Route to create a new client
router.post('/', createClient);

// Route to update client details
router.put('/update-client/:id', updateClient);

// Route to print client details
router.get('/read-by-clients-id/:id', printClientDetails);

// Route to send an email to an client
router.post('/clients/:id/send-email', sendEmailToClient);

// Route to mark an client as inactive
router.put('/clients/:id/inactivate', markClientInactive);

// Route to get a list of active clients
router.get('/clients/active', getActiveClients);

// Route to get a list of inactive clients
router.get('/clients/inactive', getInactiveClients);

// Route to get a list of all clients
router.get('/clients', getAllClients);
router.post('/delete/:id', softDelete);

module.exports = router;
