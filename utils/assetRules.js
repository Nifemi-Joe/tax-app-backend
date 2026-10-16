'use strict';

const {
  CATEGORIES, CRITICALITY_BANDS, RATING_SCORE, EOL_WARNING_DAYS, EOL_THRESHOLDS,
  EXPIRY_THRESHOLDS, REVIEW_THRESHOLDS, OVERDUE_REMINDER_DAYS, DISPOSAL_APPROVAL_SLA_DAYS,
} = require('./assetConstants');

const DAY = 86400000;
const startOfUTCDay = (d) => {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};
const daysUntil = (date, now = new Date()) => Math.round((startOfUTCDay(date) - startOfUTCDay(now)) / DAY);
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0); // 31 Jan + 1 month -> 28/29 Feb
  return d;
}

function criticalityFromValue(value) {
  if (!value && value !== 0) return null;
  const band = CRITICALITY_BANDS.find((b) => value <= b.max);
  return band ? band.label : 'Critical';
}

function valueFromCIA(c, i, a) {
  if (!RATING_SCORE[c] || !RATING_SCORE[i] || !RATING_SCORE[a]) return null;
  return RATING_SCORE[c] + RATING_SCORE[i] + RATING_SCORE[a];
}

function computeEndOfLife(asset) {
  if (asset.endOfLifeOverride) return new Date(asset.endOfLifeOverride);
  if (asset.acquisitionDate && asset.expectedLifeMonths) {
    return addMonths(asset.acquisitionDate, asset.expectedLifeMonths);
  }
  return null;
}

function computeEolState(asset, now = new Date()) {
  if (['retired', 'in_disposal', 'disposed'].includes(asset.lifecycleStatus)) return 'not_applicable';
  const kind = CATEGORIES[asset.category] && CATEGORIES[asset.category].kind;
  if (kind === 'people') return 'not_applicable';
  if (!asset.endOfLifeDate) return 'unknown';
  const days = daysUntil(asset.endOfLifeDate, now);
  if (days < 0) return 'expired';
  if (days <= EOL_WARNING_DAYS) return 'nearing';
  return 'ok';
}

/**
 * Which register fields are mandatory depends on the kind of asset.
 * Returns { flags: ['missing_owner', ...], completeness: 0-100 }.
 */
function assessQuality(asset) {
  const kind = (CATEGORIES[asset.category] || {}).kind;
  const req = ['title', 'assetId', 'classification', 'confidentiality', 'integrity', 'availability'];
  if (kind !== 'people') req.push('owner', 'custodian', 'location');
  if (kind === 'hardware') req.push('acquisitionDate', 'expectedLifeMonths', 'disposalMethod');
  if (kind === 'document') req.push('reviewCycleMonths', 'disposalMethod');
  if (kind === 'document') req.push('lastReviewedAt');

  const missing = req.filter((f) => asset[f] === undefined || asset[f] === null || asset[f] === '');
  const snake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  return {
    flags: missing.map((f) => `missing_${snake(f)}`),
    completeness: Math.round((100 * (req.length - missing.length)) / req.length),
  };
}

// ---------------------------------------------------------------------------
// Reminder engine
// ---------------------------------------------------------------------------

/** Smallest threshold that is >= days remaining; the tightest bucket we are currently inside. */
const bucket = (days, thresholds) => {
  const eligible = thresholds.filter((t) => days <= t);
  return eligible.length ? Math.min(...eligible) : null;
};

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function dateMilestones({ key, label, date, thresholds, now }) {
  if (!date) return [];
  const days = daysUntil(date, now);
  const iso = isoDay(date);

  if (days > 0) {
    const b = bucket(days, thresholds);
    if (b === null) return [];
    return [{
      type: `${key}_upcoming`,
      severity: b <= 7 ? 'high' : b <= 30 ? 'warning' : 'info',
      dueDate: new Date(date), daysRemaining: days,
      dedupeKey: `${key}:${iso}:t${b}`,
      message: `${label} in ${plural(days, 'day')} (${iso}).`,
    }];
  }

  const overdue = -days;
  const weeks = Math.floor(overdue / OVERDUE_REMINDER_DAYS);
  if (weeks >= 1) {
    return [{
      type: `${key}_overdue`, severity: 'critical',
      dueDate: new Date(date), daysRemaining: days,
      dedupeKey: `${key}:${iso}:overdue:w${weeks}`,
      message: `${label} passed ${plural(overdue, 'day')} ago (${iso}) and is still not actioned.`,
    }];
  }
  return [{
    type: `${key}_reached`, severity: 'critical',
    dueDate: new Date(date), daysRemaining: days,
    dedupeKey: `${key}:${iso}:reached`,
    message: days === 0 ? `${label} is today (${iso}).` : `${label} passed ${plural(overdue, 'day')} ago (${iso}).`,
  }];
}

/**
 * Pure function: given an asset (plain object) and "now", returns every notification
 * that should exist right now. Idempotency comes from dedupeKey + a unique index in the DB.
 */
function evaluateMilestones(asset, now = new Date()) {
  const out = [];
  const status = asset.lifecycleStatus;
  const live = ['active', 'under_maintenance'].includes(status);
  const kind = (CATEGORIES[asset.category] || {}).kind;

  if (live && kind !== 'people') {
    out.push(...dateMilestones({ key: 'eol', label: 'End of life', date: asset.endOfLifeDate, thresholds: EOL_THRESHOLDS, now }));
    out.push(...dateMilestones({ key: 'license', label: 'License expiry', date: asset.licenseExpiryDate, thresholds: EXPIRY_THRESHOLDS, now }));
    out.push(...dateMilestones({ key: 'warranty', label: 'Warranty expiry', date: asset.warrantyExpiryDate, thresholds: EXPIRY_THRESHOLDS, now }));
  }
  if (['planned', 'active', 'under_maintenance'].includes(status)) {
    out.push(...dateMilestones({ key: 'review', label: 'Scheduled review', date: asset.nextReviewDate, thresholds: REVIEW_THRESHOLDS, now }));
  }

  const d = asset.disposal || {};
  if (status === 'in_disposal' && d.requestedAt && !d.approvedAt) {
    const age = Math.floor((startOfUTCDay(now) - startOfUTCDay(d.requestedAt)) / DAY);
    if (age >= DISPOSAL_APPROVAL_SLA_DAYS) {
      out.push({
        type: 'disposal_pending_approval', severity: 'high', dueDate: null, daysRemaining: null,
        dedupeKey: `disposal-approval:${isoDay(d.requestedAt)}:w${Math.floor(age / 7)}`,
        message: `Disposal requested ${plural(age, 'day')} ago is still waiting for a second approver.`,
      });
    }
  }
  return out;
}

module.exports = {
  daysUntil, isoDay, addMonths, criticalityFromValue, valueFromCIA, computeEndOfLife,
  computeEolState, assessQuality, evaluateMilestones, dateMilestones,
};
