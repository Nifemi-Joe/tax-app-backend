/**
 * @file userAgent.js
 * @description User-agent parsing and a stable, privacy-friendly device fingerprint.
 * Uses ua-parser-js v1 (MIT). Do NOT install v2 – it is AGPL-3.0 licensed.
 */

'use strict';

const crypto = require('crypto');

let UAParser = null;
try {
  // eslint-disable-next-line global-require
  const mod = require('ua-parser-js');
  UAParser = mod.UAParser || mod;
} catch (_) {
  UAParser = null;
}

const BOT_RE = /(bot|crawler|spider|curl|wget|python-requests|httpclient|postman|insomnia|axios|node-fetch|go-http-client|java\/|okhttp|headless)/i;

function parseUserAgent(raw) {
  const ua = String(raw || '').slice(0, 512);
  const base = { userAgent: ua, browser: 'Unknown', os: 'Unknown', device: 'desktop', isMobile: false, isBot: BOT_RE.test(ua) };
  if (!ua) return { ...base, device: 'unknown' };
  if (!UAParser) return base;
  const r = new UAParser(ua).getResult();
  const deviceType = (r.device && r.device.type) || 'desktop';
  const browser = [r.browser && r.browser.name, r.browser && r.browser.major].filter(Boolean).join(' ') || 'Unknown';
  const os = [r.os && r.os.name, r.os && r.os.version].filter(Boolean).join(' ') || 'Unknown';
  return {
    ...base,
    browser,
    browserFamily: (r.browser && r.browser.name) || 'Unknown',
    os,
    osFamily: (r.os && r.os.name) || 'Unknown',
    device: deviceType,
    deviceModel: [r.device && r.device.vendor, r.device && r.device.model].filter(Boolean).join(' ') || undefined,
    isMobile: ['mobile', 'tablet', 'wearable'].includes(deviceType),
  };
}

/**
 * Fingerprint built from coarse attributes only (browser family, OS family, device type,
 * optional app-generated device id). Browser *versions* are excluded so routine updates
 * don't trigger "new device" alerts.
 */
function deviceFingerprint(parsed, clientDeviceId) {
  const parts = [parsed.browserFamily || parsed.browser, parsed.osFamily || parsed.os, parsed.device, clientDeviceId || ''];
  return crypto.createHash('sha256').update(parts.join('|').toLowerCase()).digest('hex').slice(0, 32);
}

module.exports = { parseUserAgent, deviceFingerprint };
