'use strict';

const crypto = require('crypto');
const Asset = require('../models/Asset');
const AssetEvent = require('../models/AssetEvent');

function secret() {
  const s = process.env.ASSET_AUDIT_HMAC_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ASSET_AUDIT_HMAC_SECRET (min 32 chars) is required in production');
  }
  return 'dev-only-insecure-secret-change-me-0123456789';
}

const clip = (v, n = 500) => {
  if (v === undefined || v === null) return '';
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

function canonical(e) {
  return JSON.stringify([
    String(e.asset), e.seq, e.action, e.actor.id, e.actor.name, e.actor.role, e.ip,
    (e.changes || []).map((c) => [c.field, c.from, c.to]), e.note,
    new Date(e.at).toISOString(), e.prevHash || '',
  ]);
}
const sign = (e) => crypto.createHmac('sha256', secret()).update(canonical(e)).digest('hex');

function diff(before, after, fields) {
  const out = [];
  fields.forEach((f) => {
    const a = clip(before[f]);
    const b = clip(after[f]);
    if (a !== b) out.push({ field: f, from: a, to: b });
  });
  return out;
}

/** Appends one event to the asset's chain. Retries if two writers race for the same seq. */
async function appendEvent({ asset, action, actor, req, changes = [], note = '' }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await AssetEvent.findOne({ asset: asset._id }).sort({ seq: -1 }).lean();
    const evt = {
      asset: asset._id,
      assetId: asset.assetId,
      seq: last ? last.seq + 1 : 1,
      action,
      actor: { id: String(actor.id), name: clip(actor.name, 200), role: clip(actor.role, 40) },
      ip: req ? clip(req.ip, 64) : '',
      userAgent: req ? clip(req.get && req.get('user-agent'), 300) : '',
      changes,
      note: clip(note, 2000),
      at: new Date(),
      prevHash: last ? last.hash : '',
    };
    evt.hash = sign(evt);
    try {
      const doc = await AssetEvent.create(evt);
      await Asset.updateOne({ _id: asset._id }, { $set: { lastEventHash: evt.hash }, $inc: { eventCount: 1 } });
      return doc;
    } catch (e) {
      if (e.code !== 11000) throw e; // duplicate (asset, seq) -> someone else won, retry
    }
  }
  throw new Error('Could not append asset event after 5 attempts');
}

async function verifyChain(asset) {
  const events = await AssetEvent.find({ asset: asset._id }).sort({ seq: 1 }).lean();
  let prev = '';
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i];
    if (e.seq !== i + 1) return { valid: false, checked: i, brokenAtSeq: i + 1, reason: 'missing or reordered event' };
    if ((e.prevHash || '') !== prev) return { valid: false, checked: i, brokenAtSeq: e.seq, reason: 'broken link to previous event' };
    const expected = sign(e);
    const a = Buffer.from(expected);
    const b = Buffer.from(String(e.hash));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, checked: i, brokenAtSeq: e.seq, reason: 'event content was modified' };
    }
    prev = e.hash;
  }
  const anchorOk = events.length === (asset.eventCount || 0)
    && (events.length === 0 || events[events.length - 1].hash === asset.lastEventHash);
  return anchorOk
    ? { valid: true, checked: events.length }
    : { valid: false, checked: events.length, reason: 'event count / last hash does not match the asset anchor (events removed or truncated)' };
}

module.exports = { appendEvent, verifyChain, diff, clip };
