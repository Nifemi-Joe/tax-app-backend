/**
 * @file UserLoginProfile.js
 * @description Per-user sign-in baseline used for anomaly detection: known locations and
 * devices, last sign-in (for impossible-travel), recent sign-ins, failed-attempt counter and lockout.
 * Kept separate from the User model so it works regardless of the User schema.
 */

'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const locationSchema = new Schema({
  countryCode: String,
  country: String,
  region: String,
  city: String,
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  count: { type: Number, default: 1 },
  trusted: { type: Boolean, default: false },
}, { _id: false });

const deviceSchema = new Schema({
  fingerprint: String,
  browser: String,
  os: String,
  device: String,
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  lastIp: String,
  count: { type: Number, default: 1 },
  trusted: { type: Boolean, default: false },
}, { _id: false });

const loginPointSchema = new Schema({
  at: Date,
  ip: String,
  countryCode: String,
  country: String,
  city: String,
  lat: Number,
  lon: Number,
  deviceFingerprint: String,
  browser: String,
  os: String,
  riskScore: Number,
}, { _id: false });

const userLoginProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  loginCount: { type: Number, default: 0 },
  lastLogin: { type: loginPointSchema },
  recentLogins: { type: [loginPointSchema], default: [] },
  knownLocations: { type: [locationSchema], default: [] },
  knownDevices: { type: [deviceSchema], default: [] },

  failedCount: { type: Number, default: 0 },
  failedWindowStart: { type: Date, default: null },
  lastFailedAt: Date,
  lastFailedIp: String,
  lockUntil: { type: Date, default: null },
  lockReason: { type: String, default: null },
  forcePasswordReset: { type: Boolean, default: false },
}, { timestamps: true, collection: 'user_login_profiles' });

userLoginProfileSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.models.UserLoginProfile || mongoose.model('UserLoginProfile', userLoginProfileSchema);
