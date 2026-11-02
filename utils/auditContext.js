/**
 * @file auditContext.js
 * @description Request-scoped context (AsyncLocalStorage). Lets any code – models, services,
 * Mongoose hooks, legacy logAction() calls – know who is acting, from which IP and in which
 * request, without passing `req` everywhere.
 */

'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { randomUUID } = require('crypto');

const als = new AsyncLocalStorage();

/** Run fn inside a context store. */
function run(store, fn) {
  return als.run(store, fn);
}

/** Current store or undefined (outside a request / job). */
function get() {
  return als.getStore();
}

/** Run background work (cron jobs, scripts) attributed to a named system actor. */
function runAsSystem(name, fn) {
  return als.run({ systemActor: name || 'system', requestId: randomUUID(), startedAt: Date.now(), handled: false }, fn);
}

/** Run fn without producing automatic data-trail events (explicit events are still recorded). */
async function withoutTrail(fn) {
  const store = als.getStore();
  if (!store) return als.run({ suppressTrail: 1 }, fn);
  store.suppressTrail = (store.suppressTrail || 0) + 1;
  try {
    return await fn();
  } finally {
    store.suppressTrail -= 1;
  }
}

module.exports = { als, run, get, runAsSystem, withoutTrail };
