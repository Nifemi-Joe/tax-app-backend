'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const AssetNotification = require('../models/AssetNotification');
const sendEmail = require('../utils/emailService');
const { ADMIN_ROLES } = require('../utils/assetConstants');

const APP_URL = (process.env.ASSET_APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
const SEV_ORDER = { critical: 0, high: 1, warning: 2, info: 3 };

async function getAdmins(companyId) {
  const q = { role: { $in: ADMIN_ROLES }, status: 'active' };
  if (companyId && mongoose.isValidObjectId(companyId)) q.$or = [{ companyId }, { companyId: null }, { companyId: { $exists: false } }];
  return User.find(q).select('_id email firstname lastname name role').lean();
}

/** Admins + (optional) linked owner / custodian users, de-duplicated. */
async function recipientsForAsset(asset, adminCache) {
  const map = new Map();
  (adminCache || await getAdmins(asset.companyId)).forEach((u) => map.set(String(u._id), u));
  const extraIds = [asset.ownerUser, asset.custodianUser].filter(Boolean).map(String).filter((id) => !map.has(id));
  if (extraIds.length) {
    const extra = await User.find({ _id: { $in: extraIds }, status: 'active' }).select('_id email firstname lastname name role').lean();
    extra.forEach((u) => map.set(String(u._id), u));
  }
  return [...map.values()];
}

/** Creates the notification once per (recipient, dedupeKey). Returns the doc only if it is new. */
async function createOnce({ asset, recipient, type, severity, message, dueDate = null, daysRemaining = null, dedupeKey }) {
  const doc = {
    recipient: recipient._id,
    asset: asset ? asset._id : null,
    assetId: asset ? asset.assetId : '',
    assetTitle: asset ? asset.title : '',
    type, severity, message, dueDate, daysRemaining, dedupeKey,
  };
  const res = await AssetNotification.updateOne(
    { recipient: recipient._id, dedupeKey },
    { $setOnInsert: doc },
    { upsert: true },
  );
  if (!res.upsertedCount) return null;
  return { ...doc, _id: res.upsertedId, recipientUser: recipient };
}

/** Immediate notification to every admin (except the actor) after a lifecycle event. */
async function notifyAdmins({ asset, type = 'lifecycle_change', severity = 'info', message, excludeUserId, dedupeKey }) {
  const admins = (await getAdmins(asset.companyId)).filter((a) => String(a._id) !== String(excludeUserId));
  const created = [];
  for (const admin of admins) {
    const n = await createOnce({ asset, recipient: admin, type, severity, message, dedupeKey });
    if (n) created.push(n);
  }
  await sendDigests(created, { subjectPrefix: 'Asset lifecycle update' });
  return created.length;
}

function renderEmail(user, items) {
  const name = user.firstname || user.name || 'Admin';
  const sorted = [...items].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const lines = sorted.map((n) => `- [${n.severity.toUpperCase()}] ${n.assetId ? `${n.assetId} - ${n.assetTitle}: ` : ''}${n.message}`);
  return [
    `Dear ${name},`, '',
    'The Global SJX asset inventory has raised the following item(s) that need attention:', '',
    ...lines, '',
    APP_URL ? `Open the inventory: ${APP_URL}/assets` : 'Open the Assets page in the finance app to action these.',
    '', 'This is an automated message from the ISMS asset inventory. Please do not reply.',
  ].join('\n');
}

/** One e-mail per recipient (digest) instead of one per asset, so a big scan never floods an inbox. */
async function sendDigests(created, { subjectPrefix = 'Asset lifecycle alerts' } = {}) {
  const byUser = new Map();
  created.forEach((n) => {
    const k = String(n.recipient);
    if (!byUser.has(k)) byUser.set(k, { user: n.recipientUser, items: [] });
    byUser.get(k).items.push(n);
  });
  let sent = 0;
  for (const { user, items } of byUser.values()) {
    if (!user || !user.email) continue;
    const crit = items.filter((i) => i.severity === 'critical').length;
    const subject = `[GSJX Assets] ${subjectPrefix}: ${items.length} item${items.length === 1 ? '' : 's'}${crit ? ` (${crit} critical)` : ''}`;
    try {
      await sendEmail(user.email, subject, renderEmail(user, items));
      await AssetNotification.updateMany({ _id: { $in: items.map((i) => i._id) } }, { $set: { emailedAt: new Date() } });
      sent += 1;
    } catch (err) {
      console.error(`[assets] e-mail to ${user.email} failed:`, err.message); // in-app notification still exists
    }
  }
  return sent;
}

module.exports = { getAdmins, recipientsForAsset, createOnce, notifyAdmins, sendDigests };
