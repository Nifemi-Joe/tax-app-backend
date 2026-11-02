/**
 * @file auditActor.js
 * @description Builds the "who / from where / which request" parts of an audit event.
 */

'use strict';

const net = require('net');
const { ROLE_GROUPS } = require('../config/auditConfig');
const { getClientIp, getForwardedChain, isPrivateIp } = require('./clientIp');
const { parseUserAgent, deviceFingerprint } = require('./userAgent');

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function asObjectIdString(v) {
  if (!v) return null;
  const s = String(v._id || v);
  return OBJECT_ID.test(s) ? s : null;
}

function roleGroupOf(role) {
  if (!role) return 'user';
  const r = String(role).toLowerCase();
  if (ROLE_GROUPS.admin.includes(r)) return 'admin';
  if (ROLE_GROUPS.auditor.includes(r)) return 'auditor';
  return 'user';
}

function displayName(u) {
  if (!u) return 'Unknown user';
  const full = `${u.firstname || ''} ${u.lastname || u.surname || ''}`.trim();
  return full || u.name || u.email || 'Unknown user';
}

function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at < 1) return s ? `${s.slice(0, 2)}***` : '';
  const local = s.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${s.slice(at)}`;
}

function actorFromUser(user) {
  if (!user) return anonymousActor();
  const role = user.role || 'user';
  return {
    type: 'user',
    userId: asObjectIdString(user._id || user.id),
    name: displayName(user),
    email: user.email || undefined,
    role,
    roleGroup: roleGroupOf(role),
    companyId: asObjectIdString(user.companyId || (user.company && user.company._id) || user.company),
  };
}

function systemActor(name) {
  return { type: 'system', name: name || 'system', role: 'system', roleGroup: 'system' };
}

function anonymousActor(identifier) {
  return { type: 'anonymous', name: identifier ? maskEmail(identifier) : 'Anonymous', role: 'anonymous', roleGroup: 'anonymous' };
}

function networkFromRequest(req) {
  const ip = getClientIp(req);
  const uaRaw = (req && req.get && req.get('user-agent')) || '';
  const parsed = parseUserAgent(uaRaw);
  const deviceIdHeader = req && req.get && req.get('x-device-id');
  const clientDeviceId = deviceIdHeader && SAFE_ID.test(deviceIdHeader) ? deviceIdHeader : undefined;
  return {
    ip,
    ipVersion: net.isIP(ip) || 0,
    isPrivate: isPrivateIp(ip),
    forwardedFor: getForwardedChain(req),
    userAgent: parsed.userAgent,
    browser: parsed.browser,
    os: parsed.os,
    device: parsed.device,
    deviceModel: parsed.deviceModel,
    isMobile: parsed.isMobile,
    isBot: parsed.isBot,
    deviceFingerprint: deviceFingerprint(parsed, clientDeviceId),
  };
}

function requestInfo(req, ctx) {
  if (!req) return undefined;
  const route = req.route && req.route.path ? `${req.baseUrl || ''}${req.route.path}` : undefined;
  const corr = req.get && req.get('x-correlation-id');
  return {
    method: req.method,
    path: String(req.originalUrl || req.url || '').split('?')[0].slice(0, 300),
    route,
    requestId: (ctx && ctx.requestId) || req.requestId,
    correlationId: corr && SAFE_ID.test(corr) ? corr : undefined,
  };
}

module.exports = {
  asObjectIdString, roleGroupOf, displayName, maskEmail,
  actorFromUser, systemActor, anonymousActor, networkFromRequest, requestInfo,
};
