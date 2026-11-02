/**
 * @file utils/auditLogger.js
 * @description Drop-in replacement for the old positional logger used across the controllers:
 *
 *   await logAction(userId, userName, 'updated_client', 'Client Management', 'Updated client …', req.body.ip);
 *
 * Every existing call keeps working, but events now go through the sealed audit pipeline with the
 * actor's role, the SERVER-derived IP (the 6th argument is ignored – a client-supplied IP can be
 * forged), geo-location, device and request id.
 *
 * New code should prefer:  require('../services/auditService').record({...})
 */

'use strict';

const mongoose = require('mongoose');
const auditService = require('../services/auditService');
const auditContext = require('./auditContext');
const { actorFromUser, anonymousActor, asObjectIdString } = require('./auditActor');
const { inferCategory } = require('./auditTaxonomy');

const MODULE_CATEGORY = {
  authentication: 'authentication',
  gdpr: 'privacy',
  'user management': 'administration',
  'employee management': 'administration',
};

async function resolveActor(userId, userName) {
  const id = asObjectIdString(userId);
  const ctx = auditContext.get();
  const reqUser = ctx && ctx.req && ctx.req.user;
  if (id && reqUser && String(reqUser._id) === id) return actorFromUser(reqUser);
  if (id && mongoose.models.User) {
    try {
      const u = await mongoose.models.User.findById(id).select('firstname lastname name email role companyId company').lean();
      if (u) return actorFromUser(u);
    } catch (_) { /* fall through */ }
  }
  if (id) return { type: 'user', userId: id, name: userName || undefined, roleGroup: 'user' };
  return anonymousActor(userName);
}

/**
 * @param {string|ObjectId|null} userId
 * @param {string} userName
 * @param {string} action
 * @param {string} module
 * @param {string} details
 * @returns {Promise<object|null>} saved event (never throws)
 */
async function logAction(userId, userName, action, module, details /* , ignoredClientIp */) {
  try {
    const actor = await resolveActor(userId, userName);
    const a = String(action || '');
    const outcome = /^failed_|_failed$|^failed/.test(a) ? 'failure' : 'success';
    const category = MODULE_CATEGORY[String(module || '').toLowerCase()] || inferCategory(a, module);
    return await auditService.record({ action: a, module, description: details, actor, outcome, category, source: 'legacy' });
  } catch (e) {
    console.error('[audit] logAction failed:', e.message); // eslint-disable-line no-console
    return null;
  }
}

logAction.record = auditService.record;
logAction.diff = auditService.diff;

module.exports = logAction;
