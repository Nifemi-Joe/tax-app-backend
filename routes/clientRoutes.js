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
const {validateObjectId} = require('../middlewares/errorMiddleware');
const {authorize, protect, authorizePermissions} = require("../middlewares/authMiddleware");

// Route to create a new client
router.post('/',protect, authorize('superadmin', 'admin', 'clientAdmin','employee'), authorizePermissions('create-client'), createClient);

// Route to update client details
router.put('/update-client/:id',protect, authorize('superadmin', 'admin', 'clientAdmin'), authorizePermissions('update-client'), validateObjectId('id'), updateClient);

// Route to print client details
router.get('/read-by-clients-id/:id',protect, validateObjectId('id'), printClientDetails);

// Route to send an email to an client
router.post('/clients/:id/send-email',protect, validateObjectId('id'), sendEmailToClient);

// Route to mark an client as inactive
router.put('/clients/:id/inactivate',protect, validateObjectId('id'), markClientInactive);

// Route to get a list of active clients
router.get('/clients/active',protect, getActiveClients);

// Route to get a list of inactive clients
router.get('/clients/inactive',protect, getInactiveClients);

// Route to get a list of all clients
router.get('/clients',protect, getAllClients);
router.post('/delete/:id',protect,  authorize('superadmin', 'admin', 'clientAdmin'),  authorizePermissions('delete-client'), validateObjectId('id'), softDelete);

module.exports = router;
