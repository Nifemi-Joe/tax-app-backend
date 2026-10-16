#!/usr/bin/env node
'use strict';
/**
 * Imports Global_SJX_ISMS_Asset_Register.xlsx into the Asset collection.
 *
 *   node scripts/importAssetRegister.js ./Global_SJX_ISMS_Asset_Register.xlsx --dry-run
 *   node scripts/importAssetRegister.js ./Global_SJX_ISMS_Asset_Register.xlsx [--baseline-date=2024-09-23] [--company=<ObjectId>]
 *
 * - Idempotent: assets whose assetId already exists are skipped, never overwritten.
 * - --baseline-date is an explicit decision: the register has NO acquisition / last-review dates, so without it
 *   no lifecycle reminder can fire. With it, hardware gets acquisitionDate = date and documents lastReviewedAt = date.
 *   Use the register's own effective date (23/09/2024) only if that is genuinely when the items were acquired/reviewed.
 */
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const { parseWorkbook } = require('../utils/assetRegisterParser');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const dry = args.includes('--dry-run');

(async () => {
  if (!file) { console.error('Usage: node scripts/importAssetRegister.js <register.xlsx> [--dry-run] [--baseline-date=YYYY-MM-DD] [--company=<id>]'); process.exit(1); }
  const baseline = opt('baseline-date');
  if (baseline && Number.isNaN(new Date(baseline).getTime())) { console.error('Invalid --baseline-date'); process.exit(1); }

  const { assets, skipped, summary } = await parseWorkbook(path.resolve(file), { baselineDate: baseline || null });
  console.log('Parsed:', JSON.stringify(summary, null, 2));
  skipped.forEach((s) => console.log(`  skipped ${s.sheet} row ${s.row}: ${s.reason}`));
  const flagCount = {};
  assets.forEach((a) => a.dataQualityFlags.forEach((f) => { flagCount[f] = (flagCount[f] || 0) + 1; }));
  console.log('Import flags:', flagCount);
  if (dry) { console.log('Dry run: nothing written.'); return; }

  const Asset = require('../models/Asset');
  const { appendEvent } = require('../utils/assetAudit');
  await mongoose.connect(process.env.MONGO_URI);
  const companyId = opt('company') || process.env.ASSET_DEFAULT_COMPANY_ID || null;
  if (companyId && !mongoose.isValidObjectId(companyId)) throw new Error('--company is not a valid ObjectId');

  let created = 0; let existing = 0; let failed = 0;
  for (const a of assets) {
    try {
      if (await Asset.exists({ assetId: a.assetId })) { existing += 1; continue; }
      const doc = await Asset.create({ ...a, companyId: companyId || null, createdBy: 'System:import', updatedBy: 'System:import' });
      await appendEvent({
        asset: doc, action: 'imported', actor: { id: 'system', name: 'Asset register import', role: 'system' },
        note: `Imported from ${path.basename(file)} / ${a.source.sheet} row ${a.source.row}${baseline ? `; baseline date ${baseline}` : ''}`,
      });
      created += 1;
    } catch (e) { failed += 1; console.error(`  FAILED ${a.assetId}: ${e.message}`); }
  }
  console.log(`Done. created=${created} alreadyExisted=${existing} failed=${failed}`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect().catch(() => {}));
