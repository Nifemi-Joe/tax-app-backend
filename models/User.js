const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// User Schema
const userSchema = new mongoose.Schema({
	name: {
		type: String,
		required: [true, 'Name is required'],
		trim: true,
		maxlength: [50, 'Name cannot be more than 50 characters']
	},
	email: {
		type: String,
		required: [true, 'Email is required'],
		unique: true,
		trim: true,
		lowercase: true,
		validate: {
			validator: function (v) {
				return /^([a-zA-Z0-9._-]+)@([\da-zA-Z.-]+)\.([a-zA-Z.]{2,6})$/.test(v);
			},
			message: 'Invalid email format'
		}
	},
	password: {
		type: String,
		required: [true, 'Password is required'],
		minlength: [6, 'Password must be at least 6 characters long']
	},
	role: {
		type: String,
		enum: ['user', 'admin'],
		default: 'user'
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
	resetPasswordToken: String,
	resetPasswordExpire: Date
}, {
	timestamps: true
});

// Encrypt password before saving user
userSchema.pre('save', async function (next) {
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
