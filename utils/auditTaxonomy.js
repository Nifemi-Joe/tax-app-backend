/**
 * @file auditTaxonomy.js
 * @description Consistent naming, categorisation and severity for audit events.
 */

'use strict';

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

const MODULE_LABELS = {
  user: 'User Management', users: 'User Management', auth: 'Authentication', security: 'Security',
  clients: 'Client Management', client: 'Client Management', employees: 'Employee Management',
  employee: 'Employee Management', accounts: 'Account Management', account: 'Account Management',
  revenue: 'Revenue Management', invoices: 'Revenue Management', expenses: 'Expense Management',
  expense: 'Expense Management', taxes: 'Tax Management', tax: 'Tax Management',
  'tax-returns': 'Tax Returns', wht: 'WHT Management', vats: 'VAT Management', vat: 'VAT Management',
  rates: 'Rate Management', services: 'Service Management', assets: 'Asset Inventory',
  mail: 'Mail', audit: 'Audit & Compliance', gdpr: 'Privacy (GDPR)',
};

function normalizeAction(action) {
  return String(action || 'event')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120) || 'event';
}

function toSnake(s) {
  return String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
}

function moduleLabel(resource) {
  if (!resource) return 'General';
  const key = String(resource).toLowerCase();
  if (MODULE_LABELS[key]) return MODULE_LABELS[key];
  return key.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferCategory(action, module) {
  const a = `${action || ''} ${module || ''}`.toLowerCase();
  if (/integrity|tamper|alert|suspicious|brute|stuffing|lockout|locked|rate_limited|compromise/.test(a)) return 'security';
  if (/gdpr|consent|privacy|erasure|subject_access|pseudonym|legal_hold|data_export_request/.test(a)) return 'privacy';
  if (/login|logout|sign_?in|sign_?out|password|2fa|mfa|otp|session|token|authentication/.test(a)) return 'authentication';
  if (/denied|forbidden|unauthori[sz]ed|permission|privilege|role_change/.test(a)) return 'authorization';
  if (/(^|[_.\s])(user|users|register(ed)?|employee)([_.\s]|$)|activate|deactivat|config|setting|backup|restore|retention/.test(a)) return 'administration';
  if (/export|download|print|view|read|list|search|spool|report|track/.test(a)) return 'data_access';
  if (/creat|updat|delet|archiv|approv|reject|pay|paid|disburs|dispos|import|edit|change|insert|remove|inactivat|review|lifecycle/.test(a)) return 'data_change';
  return 'system';
}

function inferSeverity({ category, outcome, action }) {
  const a = String(action || '');
  if (category === 'security') return outcome === 'success' ? 'high' : 'high';
  if (outcome === 'denied') return category === 'authorization' ? 'medium' : 'medium';
  if (outcome === 'failure') {
    if (category === 'system') return 'high';
    if (category === 'authentication') return 'low';
    return 'medium';
  }
  if (category === 'privacy' || category === 'administration' || category === 'authorization') return 'medium';
  if (category === 'data_change') return /delet|remove|dispos|archiv/.test(a) ? 'medium' : 'low';
  if (category === 'data_access') return /export|download/.test(a) ? 'medium' : 'info';
  return 'info';
}

function maxSeverity(...sevs) {
  return sevs.filter(Boolean).reduce((m, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[m] ? s : m), 'info');
}

function bumpSeverity(sev) {
  const order = Object.keys(SEVERITY_RANK);
  return order[Math.min(order.indexOf(sev) + 1, order.length - 1)];
}

module.exports = { SEVERITY_RANK, normalizeAction, toSnake, moduleLabel, inferCategory, inferSeverity, maxSeverity, bumpSeverity };
