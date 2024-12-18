const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// User Schema
const userSchema = new mongoose.Schema({
	firstname: {
		type: String,
		required: [true, 'First name is required'],
		trim: true,
		maxlength: [50, 'First name cannot be more than 50 characters']
	},
	lastname: {
		type: String,
		required: [true, 'Last name is required'],
		trim: true,
		maxlength: [50, 'Last name cannot be more than 50 characters']
	},
	name: {
		type: String,
		trim: true,
	},
	middlename: {
		type: String,
		trim: true,
		maxlength: [50, 'Middle name cannot be more than 50 characters']
	},
	email: {
		type: String,
		required: [true, 'Email is required'],
		trim: true,
		lowercase: true,
	},
	phoneNumber: {
		type: String,
		required: true,
		trim: true,
	},
	password: {
		type: String,
		required: [true, 'Password is required'],
		minlength: [6, 'Password must be at least 6 characters long']
	},
	gender: {
		type: String,
		enum: ['male', 'female'],
	},
	department: {
		type: String,
	},
	position: {
		type: String,
	},
	address: {
		type: String
	},
	salary: {
		type: Number,
	},
	company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, // Belongs to a company
	role: {
		type: String,
		enum: ['superadmin', 'admin', 'backOffice', 'frontOffice'],
		default: 'employee'
	},
	permissions: [{
		type: String,
		enum: [
			'create-client',
			'view-client',
			'create-employee',
			'view-employee',
			'create-expense',
			'view-expense',
			'create-invoice',
			'view-invoice',
			'create-service',
			'view-service',
			'view-tax',
			'view-vat',
			'create-vat',

			// Add all other permissions here
		]
	}],
	createdBy: {
		type: String,
		required: [true, 'User Created By is required'],
	},
	updatedBy: {
		type: String,
	},
	deletedBy: {
		type: String,
	},
	status: {
		type: String,
		enum: ["active", "inactive", "pending", "deleted"],
		default: "active"
	},
	companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null, },
	firstLogin: { type: Boolean, default: true }, // Force password change on first login
	resetPasswordToken: String,
	resetPasswordExpire: Date,
	createdAt: {
		type: Date,
		default: Date.now,
	},
	updatedAt: {
		type: Date,
		default: Date.now,
	},
}, {
	timestamps: true
});

// Encrypt password before saving user
userSchema.pre('save', async function (next) {
	if (this.isModified()) {
		this.updatedAt = Date.now();
	}
	if (!this.isModified('password')) return next();

	try {
		const salt = await bcrypt.genSalt(10);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (error) {
		next(error);
	}
});

// Match user entered password with hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
	return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JSON Web Token
userSchema.methods.getSignedJwtToken = function () {
	return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRE
	});
};

// Generate password reset token
userSchema.methods.getResetPasswordToken = function () {
	// Generate a token
	const resetToken = crypto.randomBytes(20).toString('hex');

	// Hash the token and set it to resetPasswordToken field
	this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

	// Set expire time
	this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

	return resetToken;
};

module.exports = mongoose.model('User', userSchema);
