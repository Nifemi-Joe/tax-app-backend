const mongoose = require('mongoose');
const { Schema } = mongoose;

// Employee Schema
const employeeSchema = new Schema({
	name: {
		type: String,
		required: true,
		trim: true,
		minlength: 3,
		maxlength: 100
	},
	email: {
		type: String,
		required: true,
		unique: true,
		trim: true,
		lowercase: true,
		validate: {
			validator: (v) => /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(v),
			message: 'Invalid email address'
		}
	},
	phoneNumber: {
		type: String,
		required: true,
		trim: true,
		validate: {
			validator: (v) => /^\+?[1-9]\d{1,14}$/.test(v),
			message: 'Invalid phone number'
		}
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