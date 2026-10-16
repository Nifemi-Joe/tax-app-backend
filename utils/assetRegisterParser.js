'use strict';

const ExcelJS = require('exceljs');
const { CATEGORIES, CLASSIFICATIONS, RATINGS } = require('./assetConstants');

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const EMPTY = new Set(['', 'n/a', 'na', 'nil', 'nill', 'none', '-', '--']);

function cellRaw(cell) {
  let v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join('');
    else if (v.result !== undefined) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else v = String(v);
  }
  return String(v).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
const clean = (s) => (EMPTY.has(String(s).trim().toLowerCase()) ? '' : String(s).trim());

// header (normalised) -> canonical field
const ALIASES = {
  title: ['assettitle', 'software', 'sourcecode', 'servername', 'devicename', 'medianame', 'utility', 'role'],
  assetId: ['assetid'],
  owner: ['owner'],
  custodian: ['custodian'],
  users: ['users', 'userrole'],
  location: ['location', 'assetlocation', 'locationserverdesktopid'],
  classification: ['classification', 'classificationasperitdept', 'classificationasperfunction'],
  lifeCycle: ['lifecycle'],
  disposalMethod: ['disposalmethod'],
  backupSchedule: ['backupschedule'],
  backupLocation: ['backuplocation'],
  backupDetails: ['backup', 'backupdetails'],
  expectedLife: ['expectedlife'],
  expiredLife: ['expiredlife'],
  maintenanceStatus: ['maintenancestatus'],
  vendor: ['vendor'],
  serialNumber: ['serialnumber'],
  makeModel: ['makemodel'],
  version: ['version', 'versionnumber'],
  registerValue: ['value'],
  rowNo: [''],
};
const LOOKUP = {};
Object.entries(ALIASES).forEach(([field, list]) => list.forEach((a) => { LOOKUP[a] = field; }));

function mapHeader(header) {
  const n = norm(header);
  if (n.startsWith('confidentiality')) return 'confidentiality';
  if (n.startsWith('integrity')) return 'integrity';
  if (n.startsWith('availability')) return 'availability';
  return LOOKUP[n] || null;
}

const camel = (s) => {
  const w = String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  return w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x.toLowerCase())).join('');
};

function parseLife(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s || EMPTY.has(s)) return {};
  const m = s.match(/(\d+(?:\.\d+)?)\s*(year|yr|month|mo)/);
  if (m) {
    const n = parseFloat(m[1]);
    return { months: Math.round(/^(year|yr)/.test(m[2]) ? n * 12 : n) };
  }
  if (/annual/.test(s)) return { reviewMonths: 12 };
  if (/quarter/.test(s)) return { reviewMonths: 3 };
  if (/semi|half/.test(s)) return { reviewMonths: 6 };
  return {};
}

const rating = (v) => {
  const r = String(v || '').trim().toUpperCase().charAt(0);
  return RATINGS.includes(r) ? r : null;
};
const classification = (v) =>
  CLASSIFICATIONS.find((c) => c.toLowerCase() === String(v || '').trim().toLowerCase()) || null;

const pad = (n, w = 4) => String(n).padStart(w, '0');

async function parseWorkbook(filePath, { baselineDate = null } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const assets = [];
  const skipped = [];
  const seenIds = new Map(); // assetId -> count
  const sheetByName = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [v.sheet, k]));

  for (const ws of wb.worksheets) {
    const category = sheetByName[ws.name];
    if (!category) continue; // "Index" etc.
    const meta = CATEGORIES[category];

    // header row = first row (within 15) whose first cell is "#"
    let headerRow = 0;
    for (let r = 1; r <= 15; r += 1) {
      if (cellRaw(ws.getRow(r).getCell(1)) === '#') { headerRow = r; break; }
    }
    if (!headerRow) { skipped.push({ sheet: ws.name, row: 0, reason: 'header row not found' }); continue; }

    const headers = [];
    ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
      const h = cellRaw(cell);
      if (h) headers.push({ col, header: oneLine(h), field: mapHeader(h) });
    });

    for (let r = headerRow + 1; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const rec = { details: {} };
      let any = false;

      for (const { col, header, field } of headers) {
        const raw = cellRaw(row.getCell(col));
        if (!raw) continue;
        any = true;
        if (field === 'rowNo') continue;
        if (field) rec[field] = field === 'registerValue' ? Number(raw) : oneLine(clean(raw));
        else if (clean(raw)) rec.details[camel(header)] = clean(raw).slice(0, 2000);
      }
      if (!any) continue;
      if (!rec.title) { skipped.push({ sheet: ws.name, row: r, reason: 'no title (placeholder/blank row)' }); continue; }
      if (EMPTY.has(rec.title.toLowerCase())) { skipped.push({ sheet: ws.name, row: r, reason: `placeholder "${rec.title}"` }); continue; }

      const flags = [];
      const a = {
        category,
        title: rec.title,
        assetId: rec.assetId || '',
        owner: rec.owner || '', custodian: rec.custodian || '', users: rec.users || '',
        location: rec.location || '',
        vendor: rec.vendor || '', serialNumber: rec.serialNumber || '', makeModel: rec.makeModel || '', version: rec.version || '',
        maintenanceStatus: rec.maintenanceStatus || '',
        disposalMethod: rec.disposalMethod || '',
        backupSchedule: rec.backupSchedule || '', backupLocation: rec.backupLocation || '', backupDetails: rec.backupDetails || '',
        confidentiality: rating(rec.confidentiality), integrity: rating(rec.integrity), availability: rating(rec.availability),
        value: Number.isFinite(rec.registerValue) && rec.registerValue > 0 ? rec.registerValue : null,
        details: rec.details,
        lifecycleStatus: 'active',
        source: { sheet: ws.name, row: r },
        dataQualityFlags: [],
      };

      // Non-digital sheet re-uses "Classification" for the asset TYPE (LAPTOP, FURNITURE...)
      if (category === 'non_digital') {
        a.subCategory = rec.classification || '';
        a.classification = null;
      } else {
        a.classification = classification(rec.classification);
        if (rec.classification && !a.classification) a.details.rawClassification = rec.classification;
      }

      // People records hold personal data (NDPA): default to Restricted and say so.
      if (category === 'people') {
        a.classification = 'Restricted';
        flags.push('import_defaulted_classification');
        a.users = '';
      }

      // life cycle
      const life = parseLife(rec.lifeCycle);
      const exp = parseLife(rec.expectedLife);
      a.expectedLifeMonths = exp.months || life.months || null;
      a.reviewCycleMonths = life.reviewMonths || null;
      if (rec.lifeCycle) a.details.lifeCycleRaw = rec.lifeCycle;
      if (rec.expiredLife) a.details.expiredLifeRaw = rec.expiredLife;
      if (/inactive|decommission|retired|disposed/i.test(a.maintenanceStatus)) a.lifecycleStatus = 'retired';

      if (baselineDate) {
        if (meta.kind === 'hardware' && a.expectedLifeMonths) a.acquisitionDate = new Date(baselineDate);
        if (meta.kind === 'document' && a.reviewCycleMonths) a.lastReviewedAt = new Date(baselineDate);
      }

      // ids
      if (!a.assetId) {
        flags.push('import_generated_id');
      } else {
        const n = (seenIds.get(a.assetId) || 0) + 1;
        seenIds.set(a.assetId, n);
        if (n > 1) { a.legacyAssetId = a.assetId; a.assetId = ''; flags.push('import_duplicate_id'); }
      }
      a.dataQualityFlags = flags;
      assets.push(a);
    }
  }

  // Generate IDs for blanks, never colliding with an ID already in the file.
  const taken = new Set(assets.map((x) => x.assetId).filter(Boolean));
  const counters = {};
  for (const a of assets) {
    if (a.assetId) continue;
    const prefix = CATEGORIES[a.category].prefix;
    let n = counters[prefix] || 0;
    let id;
    do { n += 1; id = `GSJX/${prefix}/${pad(n)}`; } while (taken.has(id));
    counters[prefix] = n;
    taken.add(id);
    a.assetId = id;
  }

  const byCategory = {};
  assets.forEach((a) => { byCategory[a.category] = (byCategory[a.category] || 0) + 1; });
  return { assets, skipped, summary: { total: assets.length, byCategory, skipped: skipped.length } };
}

module.exports = { parseWorkbook, parseLife, mapHeader };
