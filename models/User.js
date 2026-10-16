/**
 * @file User.js
 * @description User model with security fields
 * Implements ISMS A.9.1.2 (User access provisioning) and A.9.2.2 (User access provisioning)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Schema } = mongoose;

const userSchema = new Schema({
	firstname: {
		type: String,
		required: [true, 'First name is required'],
		trim: true,
		maxlength: [100, 'First name cannot exceed 100 characters'],
	},
	lastname: {
		type: String,
		required: [true, 'Last name is required'],
		trim: true,
		maxlength: [100, 'Last name cannot exceed 100 characters'],
	},
	email: {
		type: String,
		required: [true, 'Email is required'],
		unique: true,
		lowercase: true,
		trim: true,
	},
	password: {
		type: String,
		required: [true, 'Password is required'],
		minlength: [8, 'Password must be at least 8 characters'],
		select: false,
	},
	role: {
		type: String,
		enum: ['user', 'admin', 'superadmin'],
		default: 'user',
	},
	phone: {
		type: String,
		trim: true,
	},
	gender: {
		type: String,
		enum: ['male', 'female', 'other'],
	},
	country: {
		type: String,
		trim: true,
	},
	address: {
		type: String,
		trim: true,
	},
	company: {
		name: {
			type: String,
			trim: true,
		},
	},
	position: {
		type: String,
		trim: true,
	},
	department: {
		type: String,
		trim: true,
	},
	avatar: {
		type: String,
		trim: true,
	},
	isActive: {
		type: Boolean,
		default: true,
	},
	isEmailVerified: {
		type: Boolean,
		default: false,
	},
	emailVerificationToken: {
		type: String,
		select: false,
	},
	emailVerificationExpires: {
		type: Date,
		select: false,
	},
	passwordResetToken: {
		type: String,
		select: false,
	},
	passwordResetExpires: {
		type: Date,
		select: false,
	},
	lastLogin: {
		type: Date,
	},
	lastLoginIp: {
		type: String,
		trim: true,
	},
	lastLoginUserAgent: {
		type: String,
		trim: true,
	},
	passwordChangedAt: {
		type: Date,
	},
	passwordHistory: [{
		type: String,
		select: false,
	}],
	twoFactorEnabled: {
		type: Boolean,
		default: false,
	},
	twoFactorSecret: {
		type: String,
		select: false,
	},
	twoFactorBackupCodes: [{
		type: String,
		select: false,
	}],
	accountSecurity: {
		passwordChanged: {
			type: Boolean,
			default: false,
		},
		emailVerified: {
			type: Boolean,
			default: false,
		},
		twoFactorEnabled: {
			type: Boolean,
			default: false,
		},
		lastLogin: {
			type: Date,
		},
		lastLoginIp: {
			type: String,
		},
		activeSessions: {
			type: Number,
			default: 0,
		},
	},
	securityPreferences: {
		loginNotifications: {
			type: Boolean,
			default: true,
		},
		suspiciousActivityAlerts: {
			type: Boolean,
			default: true,
		},
		sessionTimeout: {
			type: Number,
			default: 30,
		},
		passwordExpiry: {
			type: Number,
			default: 90,
		},
	},
	consent: {
		dataProcessing: {
			type: Boolean,
			default: false,
		},
		marketing: {
			type: Boolean,
			default: false,
		},
		consentDate: {
			type: Date,
		},
		ip: {
			type: String,
		},
	},
	deleted: {
		type: Boolean,
		default: false,
	},
	deletedAt: {
		type: Date,
	},
	deletedBy: {
		type: Schema.Types.ObjectId,
		ref: 'User',
	},
}, {
	timestamps: true,
});

// ============================================================
// INDEXES (using schema.index() only - NO index: true on fields)
// ============================================================
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ isEmailVerified: 1 });
userSchema.index({ lastLogin: 1 });
userSchema.index({ twoFactorEnabled: 1 });
userSchema.index({ deleted: 1 });

// Compound indexes
userSchema.index({ email: 1, deleted: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ lastLogin: -1 });

// ============================================================
// PRE-SAVE MIDDLEWARE
// ============================================================
userSchema.pre('save', async function(next) {
	if (!this.isModified('password')) return next();

	try {
		const salt = await bcrypt.genSalt(12);
		this.password = await bcrypt.hash(this.password, salt);

		this.passwordChangedAt = Date.now() - 1000;

		if (this.passwordHistory && this.passwordHistory.length > 0) {
			this.passwordHistory.push(this.password);
			if (this.passwordHistory.length > 5) {
				this.passwordHistory = this.passwordHistory.slice(-5);
			}
		}

		next();
	} catch (error) {
		next(error);
	}
});

// ============================================================
// INSTANCE METHODS
// ============================================================
userSchema.methods.matchPassword = async function(enteredPassword) {
	return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.changedPasswordAfter = function(timestamp) {
	if (this.passwordChangedAt) {
		const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
		return timestamp < changedTimestamp;
	}
	return false;
};

userSchema.methods.createPasswordResetToken = function() {
	const resetToken = crypto.randomBytes(32).toString('hex');
	this.passwordResetToken = crypto
		.createHash('sha256')
		.update(resetToken)
		.digest('hex');
	this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
	return resetToken;
};

userSchema.methods.createEmailVerificationToken = function() {
	const verificationToken = crypto.randomBytes(32).toString('hex');
	this.emailVerificationToken = crypto
		.createHash('sha256')
		.update(verificationToken)
		.digest('hex');
	this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
	return verificationToken;
};

userSchema.methods.getPublicProfile = function() {
	const user = this.toObject();
	delete user.password;
	delete user.passwordResetToken;
	delete user.passwordResetExpires;
	delete user.twoFactorSecret;
	delete user.passwordHistory;
	delete user.emailVerificationToken;
	return user;
};

// ============================================================
// STATIC METHODS
// ============================================================
userSchema.statics.findActiveUsers = function() {
	return this.find({ deleted: false, isActive: true });
};

userSchema.statics.findByEmail = function(email) {
	return this.findOne({ email: email.toLowerCase(), deleted: false });
};

userSchema.statics.findById = function(id) {
	return this.findOne({ _id: id, deleted: false });
};

module.exports = mongoose.model('User', userSchema);