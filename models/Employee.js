const mongoose = require('mongoose');
const { Schema } = mongoose;

// Employee Schema
const employeeSchema = new Schema({
	firstname: {
		type: String,
		required: true,
		trim: true,
		minlength: 2,
		maxlength: 200
	},
	surname: {
		type: String,
		required: true,
		trim: true,
		minlength: 2,
		maxlength: 200
	},
	middlename: {
		type: String,
		trim: true,
		minlength: 2,
		maxlength: 200
	},
	email: {
		type: String,
		required: true,
		unique: true,
		trim: true,
		lowercase: true,

	},
	phoneNumber: {
		type: String,
		required: true,
		trim: true,

	},
	address: {
		type: String,
		trim: true,
		maxlength: 255
	},
	position: {
		type: String,
		required: true,
		trim: true
	},
	department: {
		type: String,
		required: true,
		trim: true
	},
	salary: {
		type: Number,
		required: true,
		min: 0
	},
	status: {
		type: String,
		enum: ['active', 'inactive', 'retired', 'resigned', 'terminated'],
		default: 'active'
	},
	dateOfJoining: {
		type: Date,
		required: true,
		default: Date.now
	},
	dateOfTermination: {
		type: Date
	}
}, {
	timestamps: true
});

// Static method to find active employees
employeeSchema.statics.findActiveEmployees = function() {
	return this.find({ status: 'active' });
};

// Instance method to update status
employeeSchema.methods.updateStatus = function(status) {
	this.status = status;
	return this.save();
};

// Create Employee Model
const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;
