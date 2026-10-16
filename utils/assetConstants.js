'use strict';

/**
 * Single source of truth for the asset module.
 * Categories map 1:1 to the sheets in Global_SJX_ISMS_Asset_Register.xlsx.
 * `kind` drives which lifecycle fields are mandatory (see assetRules.assessQuality).
 */
const CATEGORIES = {
  digital_information: { label: 'Digital Information Asset', prefix: 'DA', kind: 'document', sheet: 'Digital Asset' },
  business_database:   { label: 'Business Database',         prefix: 'BD', kind: 'document', sheet: 'Business Databases' },
  source_code:         { label: 'Source Code',               prefix: 'SC', kind: 'document', sheet: 'Source Code' },
  software:            { label: 'Software',                  prefix: 'SW', kind: 'software', sheet: 'Software' },
  non_digital:         { label: 'Non-Digital / Physical',    prefix: 'ND', kind: 'hardware', sheet: 'Non Digital Assets' },
  people:              { label: 'People',                    prefix: 'PA', kind: 'people',   sheet: 'People Assets' },
  server:              { label: 'Server',                    prefix: 'SV', kind: 'hardware', sheet: 'Servers' },
  network_device:      { label: 'Network Device',            prefix: 'NW', kind: 'hardware', sheet: 'Network Devices' },
  desktop_laptop:      { label: 'Desktop / Laptop',          prefix: 'PC', kind: 'hardware', sheet: 'DesktopsLaptops' },
  storage_media:       { label: 'Storage Media',             prefix: 'SM', kind: 'hardware', sheet: 'Storage Media' },
  support_utility:     { label: 'Support Utility',           prefix: 'SU', kind: 'hardware', sheet: 'Support Utilities' },
};
const CATEGORY_KEYS = Object.keys(CATEGORIES);

const CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const RATINGS = ['L', 'M', 'H'];
const RATING_SCORE = { L: 1, M: 2, H: 3 };

/**
 * Register "Value" = C + I + A with L=1, M=2, H=3 (verified against every populated row of the register).
 * Criticality bands are NOT defined in the register: these are assumptions, edit to match your risk methodology.
 */
const CRITICALITY_BANDS = [
  { max: 4, label: 'Low' },
  { max: 6, label: 'Medium' },
  { max: 8, label: 'High' },
  { max: 9, label: 'Critical' },
];

// Manual workflow states. "Nearing / expired end-of-life" is a separate, computed field (eolState).
const LIFECYCLE_STATUSES = ['planned', 'active', 'under_maintenance', 'retired', 'in_disposal', 'disposed'];
const EOL_STATES = ['unknown', 'ok', 'nearing', 'expired', 'not_applicable'];

const EOL_WARNING_DAYS = 90; // eolState becomes "nearing" inside this window

// Reminder buckets (days before the date). Each bucket fires once per date, per recipient.
const EOL_THRESHOLDS = [180, 90, 60, 30, 14, 7, 1];
const EXPIRY_THRESHOLDS = [90, 60, 30, 14, 7, 1];
const REVIEW_THRESHOLDS = [30, 14, 7, 1];
const OVERDUE_REMINDER_DAYS = 7;
const DISPOSAL_APPROVAL_SLA_DAYS = 3;

const ADMIN_ROLES = ['admin', 'superadmin'];

const NOTIFICATION_TYPES = [
  ...['eol', 'license', 'warranty', 'review'].flatMap((k) => [`${k}_upcoming`, `${k}_reached`, `${k}_overdue`]),
  'disposal_pending_approval',
  'lifecycle_change',
  'missing_dates_digest',
];

module.exports = {
  CATEGORIES, CATEGORY_KEYS, CLASSIFICATIONS, RATINGS, RATING_SCORE, CRITICALITY_BANDS,
  LIFECYCLE_STATUSES, EOL_STATES, EOL_WARNING_DAYS, EOL_THRESHOLDS, EXPIRY_THRESHOLDS,
  REVIEW_THRESHOLDS, OVERDUE_REMINDER_DAYS, DISPOSAL_APPROVAL_SLA_DAYS, ADMIN_ROLES, NOTIFICATION_TYPES,
};
