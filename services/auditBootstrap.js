/**
 * @file auditBootstrap.js
 * @description Two-phase wiring for the audit system.
 *
 *   // server.js – VERY TOP, before any require('./models/...') or routes
 *   require('dotenv').config();
 *   const auditBootstrap = require('./services/auditBootstrap');
 *   auditBootstrap.registerPlugin();
 *
 *   // after mongoose.connect(...) resolves
 *   await auditBootstrap.start();
 */

'use strict';

const mongoose = require('mongoose');

let pluginRegistered = false;
let started = false;

function registerPlugin() {
  if (pluginRegistered) return;
  // Compile the audit's own models first so they never receive the data-trail plugin.
  /* eslint-disable global-require */
  require('../models/AuditChainHead');
  require('../models/AuditTombstone');
  require('../models/AuditLog');
  require('../models/SecurityAlert');
  require('../models/UserLoginProfile');
  mongoose.plugin(require('../plugins/auditTrailPlugin'));
  /* eslint-enable global-require */
  pluginRegistered = true;

  const compiled = mongoose.modelNames().filter((n) => !['AuditChainHead', 'AuditTombstone', 'AuditLog', 'SecurityAlert', 'UserLoginProfile'].includes(n));
  if (compiled.length) {
    // eslint-disable-next-line no-console
    console.warn(`[audit] These models were compiled BEFORE the audit plugin and will not have a data trail: ${compiled.join(', ')}. Call registerPlugin() before requiring models.`);
  }
}

async function start({ scheduler = true, replay = true } = {}) {
  if (started) return;
  started = true;
  /* eslint-disable global-require */
  const AuditLog = require('../models/AuditLog');
  const SecurityAlert = require('../models/SecurityAlert');
  const AuditTombstone = require('../models/AuditTombstone');
  const UserLoginProfile = require('../models/UserLoginProfile');
  const auditService = require('./auditService');
  const securityAlertService = require('./securityAlertService');
  const retention = require('./auditRetentionService');
  const auditContext = require('../utils/auditContext');
  const { getHmacKeys } = require('../config/auditConfig');
  /* eslint-enable global-require */

  getHmacKeys(); // fail fast if no key is configured
  await Promise.all([AuditLog.init(), SecurityAlert.init(), AuditTombstone.init(), UserLoginProfile.init()]);
  securityAlertService.registerRules();
  if (replay) await auditContext.runAsSystem('audit-bootstrap', () => auditService.replayFallback());
  if (scheduler) retention.startScheduler();
  if (scheduler) require('./geoIpService').startDataWatcher(); // eslint-disable-line global-require
  await auditContext.runAsSystem('audit-bootstrap', () => auditService.record({
    action: 'system.audit_started',
    category: 'system',
    severity: 'info',
    module: 'Audit & Compliance',
    source: 'system',
    description: `Audit logging started (pid ${process.pid}, node ${process.version})`,
    markHandled: false,
  }));
}

function stop() {
  /* eslint-disable global-require */
  require('./auditRetentionService').stopScheduler();
  require('./geoIpService').stopDataWatcher();
  /* eslint-enable global-require */
}

module.exports = { registerPlugin, start, stop };
