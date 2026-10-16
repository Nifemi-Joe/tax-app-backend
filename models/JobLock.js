'use strict';

const mongoose = require('mongoose');

// Prevents two app instances running the same scheduled job at once.
const lockSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  owner: { type: String, default: '' },
  lockedUntil: { type: Date, default: null },
  lastRunAt: { type: Date, default: null },
  lastResult: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

module.exports = mongoose.model('JobLock', lockSchema);
