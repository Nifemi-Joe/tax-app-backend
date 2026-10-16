/**
 * @file assetController.js
 * @description Complete asset controller with all exports
 */

'use strict';

const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Asset = require('../models/Asset');
const AssetEvent = require('../models/AssetEvent');
const AssetNotification = require('../models/AssetNotification');
const logAction = require('../utils/auditLogger');
const { appendEvent, verifyChain, diff } = require('../utils/assetAudit');
const { sanitizeAssetInput, escapeRegex, csvSafe, cleanStr } = require('../utils/assetValidation');
const {
  CATEGORIES, CATEGORY_KEYS, CLASSIFICATIONS, LIFECYCLE_STATUSES, EOL_STATES, ADMIN_ROLES,
} = require('../utils/assetConstants');
const { notifyAdmins } = require('../services/assetNotificationService');
const { runLifecycleScan } = require('../services/assetLifecycleService');
const logger = require('../utils/logger');

// ================================================================ HELPERS
const isAdmin = (req) => ADMIN_ROLES.includes(req.user.role);
const actorName = (req) => `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || req.user.name || req.user.email || 'unknown';
const actorOf = (req) => ({ id: String(req.user._id), name: actorName(req), role: req.user.role });
const bad = (res, status, msg, extra = {}) => res.status(status).json({ responseCode: '24', responseMessage: msg, ...extra });
const safeLog = async (req, action, details) => {
  try {
    await logAction(req.user._id, actorName(req), action, 'Asset Inventory', details, req.ip);
  } catch (e) {
    logger.error('[assets] audit log failed:', e.message);
  }
};
const str = (v) => (typeof v === 'string' ? v : undefined);

function companyScope(req) {
  const id = req.user.companyId;
  return id && mongoose.isValidObjectId(String(id)) ? { companyId: new mongoose.Types.ObjectId(String(id)) } : {};
}

function visibility(req) {
  return isAdmin(req) ? {} : { category: { $ne: 'people' }, classification: { $nin: ['Restricted'] } };
}

const scope = (req, extra = {}) => ({ $and: [{ recordStatus: { $ne: 'deleted' } }, companyScope(req), visibility(req), extra] });

async function findScoped(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return bad(res, 400, 'Invalid asset id');
  }
  const asset = await Asset.findOne(scope(req, { _id: req.params.id }));
  if (!asset) {
    return bad(res, 404, 'Asset not found');
  }
  return asset;
}

const TRACKED = [
  'title', 'subCategory', 'description', 'owner', 'custodian', 'users', 'location', 'ownerUser', 'custodianUser',
  'classification', 'confidentiality', 'integrity', 'availability', 'vendor', 'serialNumber', 'makeModel', 'version',
  'maintenanceStatus', 'acquisitionDate', 'expectedLifeMonths', 'licenseExpiryDate', 'warrantyExpiryDate',
  'reviewCycleMonths', 'lastReviewedAt', 'disposalMethod', 'backupSchedule', 'backupLocation', 'backupDetails', 'tags', 'details',
];

const pad = (n) => String(n).padStart(4, '0');

async function nextAssetId(category) {
  const prefix = CATEGORIES[category].prefix;
  const re = new RegExp(`^GSJX/${prefix}/(\\d+)$`);
  const rows = await Asset.find({ assetId: { $regex: re } }).select('assetId').lean();
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.assetId.match(re)[1], 10)), 0);
  return `GSJX/${prefix}/${pad(max + 1)}`;
}

// ================================================================ LIST
const SORTS = ['assetId', 'title', 'category', 'value', 'endOfLifeDate', 'nextReviewDate', 'updatedAt', 'completeness'];

exports.listAssets = asyncHandler(async (req, res) => {
  const q = req.query;
  const and = [];
  const eq = (field, value, allowed) => { const v = str(value); if (v && (!allowed || allowed.includes(v))) and.push({ [field]: v }); };
  eq('category', q.category, CATEGORY_KEYS);
  eq('lifecycleStatus', q.lifecycleStatus, LIFECYCLE_STATUSES);
  eq('eolState', q.eolState, EOL_STATES);
  eq('classification', q.classification, CLASSIFICATIONS);
  eq('criticality', q.criticality, ['Low', 'Medium', 'High', 'Critical']);
  const flag = str(q.flag);
  if (flag && /^[a-z_]{3,60}$/.test(flag)) and.push({ dataQualityFlags: flag });
  const text = str(q.q);
  if (text && text.trim()) {
    const rx = new RegExp(escapeRegex(cleanStr(text, 80)), 'i');
    and.push({ $or: ['title', 'assetId', 'owner', 'custodian', 'vendor', 'location', 'serialNumber'].map((f) => ({ [f]: rx })) });
  }

  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 100);
  let sort = { assetId: 1 };
  const sortParam = str(q.sort);
  if (sortParam) {
    const field = sortParam.replace(/^-/, '');
    if (SORTS.includes(field)) sort = { [field]: sortParam.startsWith('-') ? -1 : 1, _id: 1 };
  }

  const filter = scope(req, and.length ? { $and: and } : {});
  const [items, total] = await Promise.all([
    Asset.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Asset.countDocuments(filter),
  ]);
  res.json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: { items: items.map((i) => ({ ...i, revision: i.__v })), total, page, limit } });
});

exports.getAsset = asyncHandler(async (req, res) => {
  const asset = await findScoped(req, res);
  if (!asset) return;
  const events = isAdmin(req) ? await AssetEvent.find({ asset: asset._id }).sort({ seq: -1 }).limit(100).lean() : [];
  res.json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: { asset: asset.toJSON(), events } });
});

// ================================================================ CREATE
exports.createAsset = asyncHandler(async (req, res) => {
  const { data, errors } = sanitizeAssetInput(req.body, { creating: true });
  if (errors.length) return bad(res, 400, 'Validation failed', { errors });

  const generated = !data.assetId;
  let asset;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (generated) data.assetId = await nextAssetId(data.category);
    try {
      asset = await Asset.create({
        ...data,
        lifecycleStatus: 'active',
        companyId: companyScope(req).companyId || null,
        createdBy: String(req.user._id),
        updatedBy: String(req.user._id),
      });
      break;
    } catch (e) {
      if (e.code === 11000 && generated) continue;
      if (e.code === 11000) return bad(res, 409, `Asset ID ${data.assetId} already exists`);
      throw e;
    }
  }
  if (!asset) return bad(res, 409, 'Could not allocate a unique asset ID, please retry');

  await appendEvent({ asset, action: 'created', actor: actorOf(req), req, note: `Created ${asset.assetId}` });
  await safeLog(req, 'created_asset', `Created asset ${asset.assetId} - ${asset.title}`);
  res.status(201).json({ responseCode: '00', responseMessage: 'Asset created successfully', responseData: asset.toJSON() });
});

// ================================================================ UPDATE
exports.updateAsset = asyncHandler(async (req, res) => {
  const asset = await findScoped(req, res);
  if (!asset) return;
  if (asset.lifecycleStatus === 'disposed') return bad(res, 409, 'Disposed assets are read-only');
  if (!Number.isInteger(req.body.revision)) return bad(res, 400, 'revision is required');
  if (req.body.revision !== asset.__v) return bad(res, 409, 'This asset was changed by someone else. Reload and try again.', { currentRevision: asset.__v });

  const { data, errors } = sanitizeAssetInput(req.body, { creating: false });
  if (errors.length) return bad(res, 400, 'Validation failed', { errors });

  const before = asset.toObject();
  asset.set(data);
  asset.updatedBy = String(req.user._id);
  const after = asset.toObject();
  const changes = diff(before, after, TRACKED);
  if (!changes.length) return res.json({ responseCode: '00', responseMessage: 'No changes', responseData: asset.toJSON() });

  try { await asset.save(); } catch (e) {
    if (e.name === 'VersionError') return bad(res, 409, 'This asset was changed by someone else. Reload and try again.');
    throw e;
  }
  await appendEvent({ asset, action: 'updated', actor: actorOf(req), req, changes });
  await safeLog(req, 'updated_asset', `Updated asset ${asset.assetId}: ${changes.map((c) => c.field).join(', ')}`);
  res.json({ responseCode: '00', responseMessage: 'Asset updated successfully', responseData: asset.toJSON() });
});

// ================================================================ LIFECYCLE
const ACTIONS = {
  activate:          { from: ['planned', 'retired'], to: 'active', verb: 'activated' },
  start_maintenance: { from: ['active'], to: 'under_maintenance', verb: 'put into maintenance' },
  end_maintenance:   { from: ['under_maintenance'], to: 'active', verb: 'returned from maintenance' },
  retire:            { from: ['active', 'under_maintenance'], to: 'retired', verb: 'retired' },
  request_disposal:  { from: ['active', 'under_maintenance', 'retired'], to: 'in_disposal', verb: 'requested disposal of' },
  approve_disposal:  { from: ['in_disposal'], verb: 'approved disposal of' },
  cancel_disposal:   { from: ['in_disposal'], verb: 'cancelled disposal of' },
  complete_disposal: { from: ['in_disposal'], to: 'disposed', verb: 'completed disposal of' },
  extend_life:       { from: ['active', 'under_maintenance'], verb: 'extended the end of life of' },
};
const EMPTY_DISPOSAL = { reason: '', method: '', previousStatus: null, requestedBy: '', requestedByName: '', requestedAt: null, approvedBy: '', approvedByName: '', approvedAt: null, completedBy: '', completedAt: null, certificateRef: '' };

exports.lifecycleAction = asyncHandler(async (req, res) => {
  const asset = await findScoped(req, res);
  if (!asset) return;
  const action = str(req.body.action);
  const def = ACTIONS[action];
  if (!def) return bad(res, 400, `action must be one of ${Object.keys(ACTIONS).join(', ')}`);
  const note = cleanStr(str(req.body.note) || '', 1000);
  if (note.length < 5) return bad(res, 400, 'A note of at least 5 characters is required (it becomes audit evidence)');
  if (!def.from.includes(asset.lifecycleStatus)) return bad(res, 409, `Cannot ${action.replace('_', ' ')} an asset that is ${asset.lifecycleStatus.replace('_', ' ')}`);
  if (Number.isInteger(req.body.revision) && req.body.revision !== asset.__v) return bad(res, 409, 'This asset was changed by someone else. Reload and try again.');

  const me = String(req.user._id);
  const now = new Date();
  const before = asset.toObject();
  const d = asset.disposal || {};

  switch (action) {
    case 'request_disposal': {
      const method = cleanStr(str(req.body.method) || asset.disposalMethod || '', 200);
      if (!method) return bad(res, 400, 'A disposal method is required (e.g. Secure Deletion, Auction, Shredding)');
      asset.disposal = { ...EMPTY_DISPOSAL, reason: note, method, previousStatus: asset.lifecycleStatus, requestedBy: me, requestedByName: actorName(req), requestedAt: now };
      break;
    }
    case 'approve_disposal':
      if (d.approvedAt) return bad(res, 409, 'Disposal is already approved');
      if (d.requestedBy === me) return bad(res, 403, 'Four-eyes rule: a different admin must approve this disposal');
      asset.disposal = { ...d.toObject(), approvedBy: me, approvedByName: actorName(req), approvedAt: now };
      break;
    case 'cancel_disposal':
      asset.lifecycleStatus = d.previousStatus || 'active';
      asset.disposal = { ...EMPTY_DISPOSAL };
      break;
    case 'complete_disposal': {
      if (!d.approvedAt) return bad(res, 409, 'Disposal must be approved by a second admin first');
      const cert = cleanStr(str(req.body.certificateRef) || '', 200);
      if (cert.length < 3) return bad(res, 400, 'certificateRef (wipe / shredding / auction evidence reference) is required');
      asset.disposal = { ...d.toObject(), completedBy: me, completedAt: now, certificateRef: cert };
      asset.disposalMethod = d.method;
      asset.lifecycleStatus = 'disposed';
      break;
    }
    case 'extend_life': {
      const nd = new Date(str(req.body.newEndOfLifeDate) || '');
      if (Number.isNaN(nd.getTime()) || nd <= now) return bad(res, 400, 'newEndOfLifeDate must be a valid future date');
      if (note.length < 10) return bad(res, 400, 'Extending life needs a justification of at least 10 characters');
      asset.endOfLifeOverride = nd;
      break;
    }
    default:
      asset.lifecycleStatus = def.to;
  }
  asset.updatedBy = me;

  try { await asset.save(); } catch (e) {
    if (e.name === 'VersionError') return bad(res, 409, 'This asset was changed by someone else. Reload and try again.');
    throw e;
  }

  const changes = diff(before, asset.toObject(), ['lifecycleStatus', 'endOfLifeOverride', 'disposalMethod']);
  if (action.endsWith('_disposal')) changes.push({ field: 'disposal', from: '', to: JSON.stringify({ requestedBy: asset.disposal.requestedByName, approvedBy: asset.disposal.approvedByName, certificateRef: asset.disposal.certificateRef }) });
  const evt = await appendEvent({ asset, action: `lifecycle:${action}`, actor: actorOf(req), req, changes, note });
  await safeLog(req, `asset_${action}`, `${actorName(req)} ${def.verb} ${asset.assetId} - ${asset.title}`);

  const isRequest = action === 'request_disposal';
  await notifyAdmins({
    asset,
    type: isRequest ? 'disposal_pending_approval' : 'lifecycle_change',
    severity: isRequest ? 'high' : ['complete_disposal', 'extend_life', 'retire'].includes(action) ? 'warning' : 'info',
    message: `${actorName(req)} ${def.verb} ${asset.assetId} - ${asset.title}. Note: ${note}`,
    excludeUserId: req.user._id,
    dedupeKey: `lc:${evt._id}`,
  });

  res.json({ responseCode: '00', responseMessage: `Asset ${def.verb.replace(/ of$/, '')} successfully`, responseData: asset.toJSON() });
});

exports.reviewAsset = asyncHandler(async (req, res) => {
  const asset = await findScoped(req, res);
  if (!asset) return;
  if (['disposed', 'retired'].includes(asset.lifecycleStatus)) return bad(res, 409, 'Cannot review a retired or disposed asset');
  const { data, errors } = sanitizeAssetInput({ reviewCycleMonths: req.body.reviewCycleMonths });
  if (errors.length) return bad(res, 400, 'Validation failed', { errors });
  if (data.reviewCycleMonths) asset.reviewCycleMonths = data.reviewCycleMonths;
  if (!asset.reviewCycleMonths) return bad(res, 400, 'Set a review cycle (months) before recording a review');

  const before = asset.toObject();
  asset.lastReviewedAt = new Date();
  asset.lastReviewedBy = String(req.user._id);
  asset.updatedBy = String(req.user._id);
  await asset.save();
  await appendEvent({ asset, action: 'reviewed', actor: actorOf(req), req, note: cleanStr(str(req.body.note) || 'Periodic review completed', 1000), changes: diff(before, asset.toObject(), ['lastReviewedAt', 'nextReviewDate', 'reviewCycleMonths']) });
  await safeLog(req, 'reviewed_asset', `Reviewed asset ${asset.assetId}`);
  res.json({ responseCode: '00', responseMessage: 'Review recorded', responseData: asset.toJSON() });
});

exports.archiveAsset = asyncHandler(async (req, res) => {
  const asset = await findScoped(req, res);
  if (!asset) return;
  const reason = cleanStr(str(req.body.reason) || '', 500);
  if (reason.length < 10) return bad(res, 400, 'A reason of at least 10 characters is required');
  asset.recordStatus = 'deleted';
  asset.deletedBy = String(req.user._id);
  asset.deletedAt = new Date();
  asset.deleteReason = reason;
  await asset.save();
  await appendEvent({ asset, action: 'archived', actor: actorOf(req), req, note: reason });
  await safeLog(req, 'archived_asset', `Archived asset ${asset.assetId}: ${reason}`);
  res.json({ responseCode: '00', responseMessage: 'Asset archived' });
});

exports.verifyAsset = asyncHandler(async (req, res) => {
  const asset = await findScoped(req, res);
  if (!asset) return;
  const result = await verifyChain(asset);
  if (!result.valid) await safeLog(req, 'asset_integrity_failure', `Integrity check FAILED for ${asset.assetId}: ${result.reason}`);
  res.json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: result });
});

// ================================================================ STATS
exports.getStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const inDays = (n) => new Date(now.getTime() + n * 86400000);
  const live = { lifecycleStatus: { $in: ['active', 'under_maintenance'] } };
  const group = (field) => [{ $group: { _id: `$${field}`, n: { $sum: 1 } } }];

  const [r] = await Asset.aggregate([
    { $match: scope(req) },
    { $facet: {
        total: [{ $count: 'n' }],
        byCategory: group('category'),
        byClassification: group('classification'),
        byCriticality: group('criticality'),
        byLifecycle: group('lifecycleStatus'),
        byEol: group('eolState'),
        eol30: [{ $match: { ...live, endOfLifeDate: { $gte: now, $lte: inDays(30) } } }, { $count: 'n' }],
        eol90: [{ $match: { ...live, endOfLifeDate: { $gte: now, $lte: inDays(90) } } }, { $count: 'n' }],
        eolExpired: [{ $match: { ...live, endOfLifeDate: { $lt: now } } }, { $count: 'n' }],
        reviewOverdue: [{ $match: { lifecycleStatus: { $in: ['planned', 'active', 'under_maintenance'] }, nextReviewDate: { $lt: now } } }, { $count: 'n' }],
        licenseExpiring: [{ $match: { ...live, licenseExpiryDate: { $lte: inDays(60) } } }, { $count: 'n' }],
        pendingDisposal: [{ $match: { lifecycleStatus: 'in_disposal', 'disposal.approvedAt': null } }, { $count: 'n' }],
        untracked: [{ $match: { ...live, dataQualityFlags: { $in: ['missing_acquisition_date', 'missing_expected_life', 'missing_review_cycle', 'missing_last_reviewed_at'] } } }, { $count: 'n' }],
        avgCompleteness: [{ $group: { _id: null, avg: { $avg: '$completeness' } } }],
        upcoming: [
          { $match: { ...live, endOfLifeDate: { $ne: null, $lte: inDays(180) } } },
          { $sort: { endOfLifeDate: 1 } }, { $limit: 10 },
          { $project: { assetId: 1, title: 1, category: 1, endOfLifeDate: 1, eolState: 1, criticality: 1 } },
        ],
      } },
  ]);

  const n = (a) => (a && a[0] ? a[0].n : 0);
  const map = (a) => Object.fromEntries((a || []).map((x) => [x._id || 'unset', x.n]));
  res.json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: {
      total: n(r.total),
      byCategory: map(r.byCategory), byClassification: map(r.byClassification), byCriticality: map(r.byCriticality),
      byLifecycle: map(r.byLifecycle), byEol: map(r.byEol),
      eol30: n(r.eol30), eol90: n(r.eol90), eolExpired: n(r.eolExpired), reviewOverdue: n(r.reviewOverdue),
      licenseExpiring: n(r.licenseExpiring), pendingDisposal: n(r.pendingDisposal), untracked: n(r.untracked),
      avgCompleteness: r.avgCompleteness[0] ? Math.round(r.avgCompleteness[0].avg) : 0,
      upcoming: r.upcoming,
    } });
});

exports.dataQuality = asyncHandler(async (req, res) => {
  const filter = scope(req, { 'dataQualityFlags.0': { $exists: true } });
  const [byFlag, items] = await Promise.all([
    Asset.aggregate([{ $match: filter }, { $unwind: '$dataQualityFlags' }, { $group: { _id: '$dataQualityFlags', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Asset.find(filter).sort({ completeness: 1, assetId: 1 }).limit(300).select('assetId title category completeness dataQualityFlags owner custodian').lean(),
  ]);
  res.json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: { byFlag: byFlag.map((f) => ({ flag: f._id, count: f.n })), items } });
});

// ================================================================ EXPORT
const CSV_COLS = ['assetId', 'title', 'category', 'subCategory', 'owner', 'custodian', 'users', 'location', 'classification', 'confidentiality', 'integrity', 'availability', 'value', 'criticality', 'lifecycleStatus', 'eolState', 'acquisitionDate', 'expectedLifeMonths', 'endOfLifeDate', 'licenseExpiryDate', 'warrantyExpiryDate', 'reviewCycleMonths', 'lastReviewedAt', 'nextReviewDate', 'disposalMethod', 'vendor', 'serialNumber', 'makeModel', 'version', 'backupSchedule', 'backupLocation', 'completeness'];

exports.exportCsv = asyncHandler(async (req, res) => {
  const items = await Asset.find(scope(req)).sort({ assetId: 1 }).limit(5000).lean();
  const lines = [CSV_COLS.join(','), ...items.map((a) => CSV_COLS.map((c) => csvSafe(a[c])).join(','))];
  await safeLog(req, 'exported_assets', `Exported ${items.length} asset records to CSV`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="asset-register-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(`\uFEFF${lines.join('\r\n')}`);
});

// ================================================================ NOTIFICATIONS
exports.myNotifications = asyncHandler(async (req, res) => {
  const filter = { recipient: req.user._id };
  if (str(req.query.unread) === 'true') filter.readAt = null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const [items, unread] = await Promise.all([
    AssetNotification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    AssetNotification.countDocuments({ recipient: req.user._id, readAt: null }),
  ]);
  res.json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: { items, unread } });
});

const ownNotification = (req) => (mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id, recipient: req.user._id } : null);

exports.markRead = asyncHandler(async (req, res) => {
  const f = ownNotification(req);
  if (!f) return bad(res, 400, 'Invalid id');
  await AssetNotification.updateOne({ ...f, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ responseCode: '00', responseMessage: 'Marked as read' });
});

exports.acknowledge = asyncHandler(async (req, res) => {
  const f = ownNotification(req);
  if (!f) return bad(res, 400, 'Invalid id');
  const now = new Date();
  await AssetNotification.updateOne(f, { $set: { acknowledgedAt: now, acknowledgedBy: actorName(req) } });
  await AssetNotification.updateOne({ ...f, readAt: null }, { $set: { readAt: now } });
  res.json({ responseCode: '00', responseMessage: 'Acknowledged' });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await AssetNotification.updateMany({ recipient: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ responseCode: '00', responseMessage: 'All marked as read' });
});

// ================================================================ SCAN
exports.runScan = asyncHandler(async (req, res) => {
  const result = await runLifecycleScan({ trigger: 'manual' });
  await safeLog(req, 'ran_asset_scan', `Manual lifecycle scan: ${JSON.stringify(result)}`);
  res.json({ responseCode: '00', responseMessage: result.skipped ? result.reason : 'Scan completed', responseData: result });
});

// ================================================================ META
exports.meta = asyncHandler(async (_req, res) => {
  res.json({ responseCode: '00', responseMessage: 'Completed successfully', responseData: {
      categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])),
      classifications: CLASSIFICATIONS, lifecycleStatuses: LIFECYCLE_STATUSES,
    } });
});

module.exports = exports;