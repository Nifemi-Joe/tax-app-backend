'use strict';

const mongoose = require('mongoose');
const { CATEGORY_KEYS, CLASSIFICATIONS, RATINGS } = require('./assetConstants');

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const cleanStr = (v, max) => String(v).replace(CONTROL, '').trim().slice(0, max);

const STRING_FIELDS = {
  title: 300, subCategory: 120, description: 2000, owner: 200, custodian: 200, users: 300, location: 300,
  vendor: 200, serialNumber: 200, makeModel: 200, version: 100, maintenanceStatus: 100, disposalMethod: 200,
  backupSchedule: 200, backupLocation: 300, backupDetails: 300,
};
const DATE_FIELDS = ['acquisitionDate', 'licenseExpiryDate', 'warrantyExpiryDate', 'lastReviewedAt'];
const NUMBER_FIELDS = { expectedLifeMonths: [1, 600], reviewCycleMonths: [1, 120] };
const ENUM_FIELDS = { classification: CLASSIFICATIONS, confidentiality: RATINGS, integrity: RATINGS, availability: RATINGS };
const REF_FIELDS = ['ownerUser', 'custodianUser'];

const isBlank = (v) => v === undefined || v === null || v === '';

/** NoSQL-injection safe "details" bag: shallow, primitive values, plain-word keys only. */
function sanitizeDetails(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  Object.keys(input).slice(0, 60).forEach((k) => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(k)) return;
    const v = input[k];
    if (typeof v === 'string') out[k] = cleanStr(v, 2000);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  });
  return out;
}

/**
 * Whitelist + coerce. Anything not listed here (lifecycleStatus, disposal, createdBy,
 * recordStatus, eventCount...) can never be set through create/update => no mass-assignment.
 */
function sanitizeAssetInput(body, { creating = false } = {}) {
  const errors = [];
  const data = {};
  const src = body && typeof body === 'object' ? body : {};

  Object.entries(STRING_FIELDS).forEach(([f, max]) => {
    if (src[f] === undefined) return;
    if (typeof src[f] !== 'string' && src[f] !== null) { errors.push(`${f} must be text`); return; }
    data[f] = src[f] === null ? '' : cleanStr(src[f], max);
  });

  Object.entries(ENUM_FIELDS).forEach(([f, allowed]) => {
    if (src[f] === undefined) return;
    if (isBlank(src[f])) { data[f] = null; return; }
    if (typeof src[f] !== 'string' || !allowed.includes(src[f])) errors.push(`${f} must be one of ${allowed.join(', ')}`);
    else data[f] = src[f];
  });

  DATE_FIELDS.forEach((f) => {
    if (src[f] === undefined) return;
    if (isBlank(src[f])) { data[f] = null; return; }
    const d = new Date(src[f]);
    if (typeof src[f] !== 'string' || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1990 || d.getUTCFullYear() > 2100) {
      errors.push(`${f} must be a valid date (YYYY-MM-DD)`);
    } else data[f] = d;
  });

  Object.entries(NUMBER_FIELDS).forEach(([f, [min, max]]) => {
    if (src[f] === undefined) return;
    if (isBlank(src[f])) { data[f] = null; return; }
    const n = Number(src[f]);
    if (!Number.isInteger(n) || n < min || n > max) errors.push(`${f} must be a whole number between ${min} and ${max}`);
    else data[f] = n;
  });

  REF_FIELDS.forEach((f) => {
    if (src[f] === undefined) return;
    if (isBlank(src[f])) { data[f] = null; return; }
    if (typeof src[f] !== 'string' || !mongoose.isValidObjectId(src[f])) errors.push(`${f} must be a valid user id`);
    else data[f] = src[f];
  });

  if (src.tags !== undefined) {
    if (!Array.isArray(src.tags)) errors.push('tags must be a list');
    else data.tags = src.tags.filter((t) => typeof t === 'string').slice(0, 20).map((t) => cleanStr(t, 40)).filter(Boolean);
  }
  if (src.details !== undefined) data.details = sanitizeDetails(src.details);

  if (creating) {
    if (typeof src.category !== 'string' || !CATEGORY_KEYS.includes(src.category)) errors.push('category is required and must be a valid category');
    else data.category = src.category;
    if (!data.title) errors.push('title is required');
    if (src.assetId !== undefined && !isBlank(src.assetId)) {
      if (typeof src.assetId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/\-_. ]{1,78}$/.test(src.assetId.trim())) errors.push('assetId contains invalid characters');
      else data.assetId = src.assetId.trim();
    }
  } else if (src.title !== undefined && !data.title) {
    errors.push('title cannot be empty');
  }
  return { data, errors };
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Spreadsheet formula-injection guard for CSV/Excel export. */
const csvSafe = (v) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

module.exports = { sanitizeAssetInput, sanitizeDetails, escapeRegex, csvSafe, cleanStr };
