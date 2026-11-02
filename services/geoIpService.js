/**
 * @file geoIpService.js
 * @description Offline IP geolocation. IPs are resolved locally (geoip-lite, or a MaxMind
 * GeoIP2/GeoLite2 City .mmdb if GEOIP_MMDB_PATH is set) – they are NEVER sent to a third-party
 * API, so no additional processor / international transfer is introduced (GDPR Art. 28 & 44).
 */

'use strict';

const fs = require('fs');
const net = require('net');
const { isPrivateIp } = require('../utils/clientIp');

const CACHE_MAX = 10000;
const cache = new Map();

let geoipLite = null;
try {
  // eslint-disable-next-line global-require
  geoipLite = require('geoip-lite');
} catch (_) {
  geoipLite = null;
}

let mmReader = null;
if (process.env.GEOIP_MMDB_PATH) {
  try {
    // eslint-disable-next-line global-require
    const { Reader } = require('@maxmind/geoip2-node');
    mmReader = Reader.openBuffer(fs.readFileSync(process.env.GEOIP_MMDB_PATH));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[geoip] MaxMind database not loaded, falling back to geoip-lite:', e.message);
  }
}

// ---------------------------------------------------------------- keep geoip-lite data fresh
// Called once by auditBootstrap.start() in the running server (NOT at require time, so one-off
// scripts can still exit).
// 1) When `npm run geoip:update` replaces the data files, they are reloaded into memory
//    automatically – no restart needed (geoip-lite waits ~1 minute after the files change).
// 2) Optional: GEOIP_AUTO_UPDATE=true downloads fresh data every GEOIP_UPDATE_INTERVAL_DAYS
//    (default 30) in a child process. Needs MAXMIND_LICENSE_KEY.
let watching = false;
let autoTimers = [];

function startDataWatcher() {
  if (!geoipLite || watching) return;
  if (process.env.GEOIP_WATCH !== 'false' && typeof geoipLite.startWatchingDataUpdate === 'function') {
    try {
      geoipLite.startWatchingDataUpdate(() => {
        cache.clear();
        // eslint-disable-next-line no-console
        console.log('[geoip] GeoIP database reloaded');
      });
      watching = true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[geoip] could not watch for data updates:', e.message);
    }
  }
  if (process.env.GEOIP_AUTO_UPDATE === 'true' && !autoTimers.length) {
    const days = Number(process.env.GEOIP_UPDATE_INTERVAL_DAYS) || 30;
    const runUpdate = () => {
      // eslint-disable-next-line global-require
      const { spawn } = require('child_process');
      // eslint-disable-next-line global-require
      const path = require('path');
      const child = spawn(process.execPath, [path.resolve(__dirname, '../scripts/updateGeoIp.js')], { stdio: 'inherit', env: process.env });
      child.on('error', (e) => console.warn('[geoip] auto-update failed to start:', e.message)); // eslint-disable-line no-console
    };
    autoTimers = [setTimeout(runUpdate, 10 * 60 * 1000), setInterval(runUpdate, days * 86400000)];
    autoTimers.forEach((t) => t.unref && t.unref());
  }
}

function stopDataWatcher() {
  if (watching && geoipLite) geoipLite.stopWatchingDataUpdate();
  watching = false;
  autoTimers.forEach((t) => clearTimeout(t));
  autoTimers = [];
}

if (!geoipLite && !mmReader) {
  // eslint-disable-next-line no-console
  console.warn('[geoip] No GeoIP database available – install geoip-lite. Location alerts are disabled until then.');
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch (_) {
    return null;
  }
})();

const countryName = (cc) => {
  if (!cc) return '';
  try {
    return (regionNames && regionNames.of(cc)) || cc;
  } catch (_) {
    return cc;
  }
};


function clean(obj) {
  Object.keys(obj).forEach((k) => (obj[k] === undefined || obj[k] === null || obj[k] === '') && delete obj[k]);
  return obj;
}

function lookup(ip) {
  if (!ip || !net.isIP(ip)) return { countryCode: 'ZZ', country: 'Unknown', source: 'none' };
  if (isPrivateIp(ip)) return { countryCode: 'ZZ', country: 'Private network', source: 'private' };

  if (cache.has(ip)) {
    const hit = cache.get(ip);
    cache.delete(ip);
    cache.set(ip, hit);
    return { ...hit };
  }

  let r = null;
  if (mmReader) {
    try {
      const c = mmReader.city(ip);
      r = {
        countryCode: c.country && c.country.isoCode,
        country: c.country && c.country.names && c.country.names.en,
        region: c.subdivisions && c.subdivisions[0] && c.subdivisions[0].names && c.subdivisions[0].names.en,
        city: c.city && c.city.names && c.city.names.en,
        lat: c.location && c.location.latitude,
        lon: c.location && c.location.longitude,
        timezone: c.location && c.location.timeZone,
        accuracyKm: c.location && c.location.accuracyRadius,
        eu: !!(c.country && c.country.isInEuropeanUnion),
        source: 'maxmind',
      };
    } catch (_) {
      r = null;
    }
  }
  if ((!r || !r.countryCode) && geoipLite) {
    const g = geoipLite.lookup(ip);
    if (g && g.country) {
      r = {
        countryCode: g.country,
        country: countryName(g.country),
        region: g.region,
        city: g.city,
        lat: Array.isArray(g.ll) ? g.ll[0] : undefined,
        lon: Array.isArray(g.ll) ? g.ll[1] : undefined,
        timezone: g.timezone,
        accuracyKm: g.area,
        eu: g.eu === '1',
        source: 'geoip-lite',
      };
    }
  }
  if (!r || !r.countryCode) r = { countryCode: 'ZZ', country: 'Unknown', source: (r && r.source) || 'none' };
  if (!r.country) r.country = countryName(r.countryCode);
  clean(r);

  cache.set(ip, r);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return { ...r };
}

function isLocatable(geo) {
  return !!(geo && geo.countryCode && geo.countryCode !== 'ZZ');
}

function describe(geo) {
  if (!geo) return 'an unknown location';
  if (!isLocatable(geo)) return geo.country || 'an unknown location';
  return [geo.city, geo.region && geo.region.length > 3 ? geo.region : undefined, geo.country].filter(Boolean).join(', ');
}

function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function flagEmoji(cc) {
  if (!cc || cc.length !== 2 || cc === 'ZZ') return '🌐';
  return String.fromCodePoint(...cc.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
}

module.exports = { lookup, isLocatable, describe, haversineKm, flagEmoji, countryName, startDataWatcher, stopDataWatcher };
