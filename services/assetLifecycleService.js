'use strict';

const crypto = require('crypto');
const cron = require('node-cron');
const Asset = require('../models/Asset');
const JobLock = require('../models/JobLock');
const rules = require('../utils/assetRules');
const notify = require('./assetNotificationService');

const LOCK_NAME = 'asset-lifecycle-scan';

async function acquireLock(ttlMs) {
  const now = new Date();
  const owner = `${process.pid}-${crypto.randomUUID()}`;
  try {
    const doc = await JobLock.findOneAndUpdate(
      { name: LOCK_NAME, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
      { $set: { owner, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, new: true },
    );
    return doc.owner === owner ? owner : null;
  } catch (e) {
    if (e.code === 11000) return null; // lock exists and is still held
    throw e;
  }
}
const releaseLock = (owner, lastResult) =>
  JobLock.updateOne({ name: LOCK_NAME, owner }, { $set: { lockedUntil: new Date(0), lastRunAt: new Date(), lastResult } });

/**
 * Daily scan:
 *  1. refresh computed eolState (time passes without anyone saving the asset)
 *  2. raise each due reminder once per recipient (dedupeKey + unique index)
 *  3. one digest e-mail per recipient
 *  4. monthly digest for assets that cannot be tracked because lifecycle dates are missing
 */
async function runLifecycleScan({ trigger = 'cron' } = {}) {
  const owner = await acquireLock(15 * 60 * 1000);
  if (!owner) return { skipped: true, reason: 'another scan is already running' };

  const now = new Date();
  const summary = { trigger, startedAt: now, scanned: 0, stateRefreshed: 0, notificationsCreated: 0, emailsSent: 0, errors: 0 };
  try {
    const admins = await notify.getAdmins();
    const created = [];
    const untracked = [];

    const cursor = Asset.find({ recordStatus: { $ne: 'deleted' }, lifecycleStatus: { $ne: 'disposed' } }).cursor();
    for await (const asset of cursor) {
      summary.scanned += 1;
      try {
        const state = rules.computeEolState(asset, now);
        if (state !== asset.eolState) {
          await Asset.updateOne({ _id: asset._id }, { $set: { eolState: state } }); // no version bump
          summary.stateRefreshed += 1;
        }
        if (asset.dataQualityFlags.some((f) => ['missing_acquisition_date', 'missing_expected_life', 'missing_review_cycle', 'missing_last_reviewed_at'].includes(f))) {
          untracked.push(asset);
        }

        const milestones = rules.evaluateMilestones(asset.toObject(), now);
        if (!milestones.length) continue;
        const recipients = await notify.recipientsForAsset(asset, admins);
        for (const m of milestones) {
          for (const recipient of recipients) {
            const n = await notify.createOnce({ asset, recipient, ...m });
            if (n) created.push(n);
          }
        }
      } catch (e) {
        summary.errors += 1;
        console.error(`[assets] scan failed for ${asset.assetId}:`, e.message);
      }
    }

    // Monthly "we cannot track these" digest so gaps in the register do not stay silent.
    if (untracked.length) {
      const month = now.toISOString().slice(0, 7);
      for (const admin of admins) {
        const n = await notify.createOnce({
          asset: null, recipient: admin, type: 'missing_dates_digest', severity: 'warning',
          message: `${untracked.length} asset(s) have no acquisition date / expected life / review date, so no lifecycle reminders can be raised for them. Open Inventory > Data quality.`,
          dedupeKey: `missing-dates:${month}`,
        });
        if (n) created.push(n);
      }
    }

    summary.notificationsCreated = created.length;
    summary.emailsSent = await notify.sendDigests(created);
    summary.finishedAt = new Date();
    return summary;
  } finally {
    await releaseLock(owner, summary).catch((e) => console.error('[assets] could not release lock:', e.message));
  }
}

function scheduleAssetLifecycleJobs() {
  const expr = process.env.ASSET_ALERT_CRON || '0 6 * * *';
  const timezone = process.env.ASSET_ALERT_TZ || 'Africa/Lagos';
  cron.schedule(expr, () => {
    runLifecycleScan({ trigger: 'cron' })
      .then((r) => console.log('[assets] lifecycle scan:', JSON.stringify(r)))
      .catch((e) => console.error('[assets] lifecycle scan crashed:', e));
  }, { timezone });

  // Catch-up after downtime/deploys. Safe: locked + deduplicated.
  setTimeout(() => {
    runLifecycleScan({ trigger: 'startup' })
      .then((r) => console.log('[assets] startup scan:', JSON.stringify(r)))
      .catch((e) => console.error('[assets] startup scan crashed:', e));
  }, 60 * 1000).unref();

  console.log(`[assets] lifecycle scan scheduled: "${expr}" (${timezone})`);
}

module.exports = { runLifecycleScan, scheduleAssetLifecycleJobs };
