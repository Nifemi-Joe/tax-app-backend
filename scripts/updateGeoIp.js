/**
 * @file scripts/updateGeoIp.js
 * @description Downloads the latest free MaxMind GeoLite2 data into geoip-lite.
 *
 *   npm run geoip:update            (reads MAXMIND_LICENSE_KEY from .env)
 *   npm run geoip:update -- --strict  (exit 1 on failure – use in CI if you want builds to fail)
 *
 * Without --strict a missing key or failed download only prints a warning, so a deploy never
 * breaks because of GeoIP – the app keeps using the database bundled with geoip-lite.
 */

'use strict';

try {
  require('dotenv').config(); // eslint-disable-line global-require
} catch (_) { /* dotenv optional */ }

const path = require('path');
const { spawnSync } = require('child_process');

const strict = process.argv.includes('--strict');
const key = (process.env.MAXMIND_LICENSE_KEY || '').trim();

function finish(code, msg) {
  if (msg) console[code ? 'error' : 'log'](msg);
  process.exit(strict ? code : 0);
}

if (!key) {
  finish(1, '[geoip] MAXMIND_LICENSE_KEY is not set – skipping GeoIP update (using the bundled database).');
}

let script;
try {
  script = require.resolve('geoip-lite/scripts/updatedb.js');
} catch (_) {
  finish(1, '[geoip] geoip-lite is not installed. Run: npm i geoip-lite');
}

console.log('[geoip] Downloading GeoLite2 Country + City data from MaxMind (≈100 MB, takes 1–3 minutes)…');
const started = Date.now();
const r = spawnSync(process.execPath, [script, `license_key=${key}`], {
  cwd: path.resolve(path.dirname(script), '..'),
  stdio: 'inherit',
  env: process.env,
});

if (r.status === 0) {
  finish(0, `[geoip] GeoIP database updated in ${Math.round((Date.now() - started) / 1000)}s.`);
} else {
  finish(1, '[geoip] GeoIP update FAILED (see output above). Check the licence key is active and that download.maxmind.com is reachable. The app keeps using the existing database.');
}
