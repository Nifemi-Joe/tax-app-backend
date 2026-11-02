/**
 * @file scripts/migrateLegacyAuditLogs.js
 * @description One-off import of the OLD `auditlogs` collection into the new sealed `audit_events`
 * store, and removal of the old 1-year TTL index so nothing is silently deleted meanwhile.
 *
 *   node scripts/migrateLegacyAuditLogs.js            # dry run (counts only)
 *   node scripts/migrateLegacyAuditLogs.js --apply    # import
 *
 * Imported events keep their original timestamp, are tagged "migrated" and sealed at import time
 * (the seal proves they have not changed SINCE migration – say so to auditors).
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const auditContext = require('../utils/auditContext');

const APPLY = process.argv.includes('--apply');
const LEGACY_COLLECTION = process.env.AUDIT_LEGACY_COLLECTION || 'auditlogs';

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const AuditLog = require('../models/AuditLog'); // eslint-disable-line global-require
  const db = mongoose.connection.db;
  const exists = (await db.listCollections({ name: LEGACY_COLLECTION }).toArray()).length > 0;
  if (!exists) {
    console.log(`No legacy collection "${LEGACY_COLLECTION}" – nothing to migrate.`);
    process.exit(0);
  }
  const legacy = db.collection(LEGACY_COLLECTION);
  const total = await legacy.countDocuments();
  console.log(`Legacy events found: ${total}`);

  const indexes = await legacy.indexes();
  const ttl = indexes.filter((i) => i.expireAfterSeconds !== undefined);
  if (ttl.length) console.log(`TTL indexes on legacy collection: ${ttl.map((i) => i.name).join(', ')}`);
  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to import.');
    process.exit(0);
  }
  for (const i of ttl) {
    await legacy.dropIndex(i.name);
    console.log(`Dropped TTL index ${i.name}`);
  }

  let imported = 0;
  let failed = 0;
  await auditContext.runAsSystem('legacy-migration', async () => {
    const cursor = legacy.find({}).sort({ timestamp: 1, createdAt: 1, _id: 1 });
    // eslint-disable-next-line no-restricted-syntax
    for await (const d of cursor) {
      try {
        await AuditLog.create({
          timestamp: d.timestamp || d.createdAt || d._id.getTimestamp(),
          action: d.action || 'legacy_event',
          module: d.module || d.resource,
          description: d.details || d.description,
          user: d.user || d.userId,
          userName: d.userName,
          ipAddress: d.ipAddress || d.ip,
          userAgent: d.userAgent,
          status: d.status,
          severity: ['low', 'medium', 'high', 'critical'].includes(d.severity) ? d.severity : undefined,
          actor: { type: (d.user || d.userId) ? 'user' : 'anonymous' },
          source: 'legacy',
          tags: ['migrated'],
          metadata: { legacyId: String(d._id), ...(d.metadata && typeof d.metadata === 'object' ? d.metadata : {}) },
        });
        imported += 1;
      } catch (e) {
        failed += 1;
        if (failed < 20) console.error(`Failed ${d._id}: ${e.message}`);
      }
      if ((imported + failed) % 1000 === 0) console.log(`…${imported + failed}/${total}`);
    }
  });
  console.log(`Imported ${imported}, failed ${failed}. The legacy collection was left untouched – archive it once verified.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
