// models/Role.js

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
	name: { type: String, required: true, unique: true },
	permissions: [{ type: String, enum: ['create', 'view', 'edit', 'delete'] }]
});

module.exports = mongoose.model('Role', roleSchema);
