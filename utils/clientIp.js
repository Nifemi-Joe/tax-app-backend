/**
 * @file clientIp.js
 * @description Trustworthy client IP handling.
 *
 * NEVER trust an IP sent in the request body (the old code used `req.body.ip`, which any
 * caller can forge). The real client IP comes from Express's `req.ip`, which honours
 * `app.set('trust proxy', …)`. Set that to the number of proxies in front of the API
 * (e.g. 1 for Render/Heroku/Nginx) so X-Forwarded-For is parsed safely.
 */

'use strict';

const net = require('net');

const privateList = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
].forEach(([a, p]) => privateList.addSubnet(a, p, 'ipv4'));
[['::1', 128], ['::', 128], ['fc00::', 7], ['fe80::', 10]].forEach(([a, p]) => privateList.addSubnet(a, p, 'ipv6'));

function normalizeIp(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.startsWith('[')) s = s.replace(/^\[/, '').replace(/\](:\d+)?$/, '');
  const pct = s.indexOf('%');
  if (pct > -1) s = s.slice(0, pct);
  if (/^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(s)) s = s.slice(7);
  return net.isIP(s) ? s.toLowerCase() : null;
}

function isPrivateIp(ip) {
  const v = net.isIP(ip || '');
  if (!v) return false;
  try {
    return privateList.check(ip, v === 4 ? 'ipv4' : 'ipv6');
  } catch (_) {
    return false;
  }
}

/** Client IP as resolved by Express (respects `trust proxy`). */
function getClientIp(req) {
  if (!req) return 'unknown';
  return normalizeIp(req.ip) || normalizeIp(req.socket && req.socket.remoteAddress) || 'unknown';
}

/** Raw X-Forwarded-For chain, stored for forensics only – never used for decisions. */
function getForwardedChain(req) {
  const h = req && req.headers && req.headers['x-forwarded-for'];
  if (!h) return [];
  return String(h).split(',').map(normalizeIp).filter(Boolean).slice(0, 10);
}

function expandIPv6(ip) {
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  if (tail === undefined) return h.map((x) => x.padStart(4, '0'));
  const t = tail ? tail.split(':') : [];
  const fill = Array(Math.max(0, 8 - h.length - t.length)).fill('0000');
  return [...h, ...fill, ...t].map((x) => x.padStart(4, '0'));
}

/** Data minimisation: 203.0.113.57 -> 203.0.113.0, IPv6 -> /48 prefix. */
function truncateIp(ip) {
  const v = net.isIP(ip || '');
  if (v === 4) {
    const p = ip.split('.');
    p[3] = '0';
    return p.join('.');
  }
  if (v === 6) return `${expandIPv6(ip).slice(0, 3).join(':')}::`;
  return ip;
}

module.exports = { normalizeIp, isPrivateIp, getClientIp, getForwardedChain, truncateIp };
