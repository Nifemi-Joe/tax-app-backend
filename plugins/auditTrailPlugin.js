/**
 * @file auditTrailPlugin.js
 * @description Global Mongoose plugin that records a field-level data trail (who changed what,
 * from → to) for EVERY model – Client, Revenue, Expense, Employee, User, WHT, Tax, Asset, etc. –
 * without touching existing controllers.
 *
 * Covers: doc.save() (create + update), Model.create, insertMany, findByIdAndUpdate /
 * findOneAndUpdate, updateOne / updateMany, replaceOne, findByIdAndDelete / findOneAndDelete,
 * deleteOne / deleteMany and document.deleteOne().
 *
 * Registration MUST happen before any model is compiled – see services/auditBootstrap.js.
 * Opt out per query: Model.updateOne(filter, update, { auditTrail: false })
 * Opt out per block:  auditContext.withoutTrail(async () => { ... })
 */

'use strict';

const auditContext = require('../utils/auditContext');
const cfg = require('../config/auditConfig');

let svc = null;
const service = () => {
  // eslint-disable-next-line global-require
  if (!svc) svc = require('../services/auditService');
  return svc;
};

const MONGOOSE_MAJOR = parseInt(require('mongoose').version, 10) || 8; // eslint-disable-line global-require
const MAX_DOCS = cfg.trail.maxDocsPerBulkOp;
const logErr = (e) => console.error('[audit-trail]', e && e.message); // eslint-disable-line no-console

function skipModel(name) {
  if (!cfg.trail.enabled || !name || cfg.trail.excludeModels.includes(name)) return true;
  const store = auditContext.get();
  return !!(store && store.suppressTrail);
}

function skipQuery(q) {
  const name = q.model && q.model.modelName;
  if (skipModel(name)) return true;
  const opts = typeof q.getOptions === 'function' ? q.getOptions() : q.options || {};
  return opts && opts.auditTrail === false;
}

const filterOf = (q) => (typeof q.getFilter === 'function' ? q.getFilter() : q.getQuery());
const fire = (payload) => service().recordDataTrail(payload).catch(logErr);
const isSub = (doc) => !!(doc && (doc.$isSubdocument || doc.$isSingleNested || (typeof doc.ownerDocument === 'function' && doc.ownerDocument() !== doc)));

function register(schema, ops, opts, fn) {
  ops.forEach((op) => {
    try {
      schema[fn.kind](op, opts, fn.handler);
    } catch (_) { /* hook not supported in this Mongoose version */ }
  });
}

module.exports = function auditTrailPlugin(schema) {
  // ---------------------------------------------------------------- save()
  schema.pre('save', async function auditPreSave() {
    const name = this.constructor && this.constructor.modelName;
    if (isSub(this) || skipModel(name)) return;
    this.$locals.auditOp = this.isNew ? 'create' : 'update';
    if (!this.isNew) {
      try {
        this.$locals.auditBefore = await this.constructor.findById(this._id).lean();
      } catch (e) {
        logErr(e);
      }
    }
  });

  schema.post('save', function auditPostSave(doc) {
    const name = doc.constructor && doc.constructor.modelName;
    if (isSub(doc) || !doc.$locals || !doc.$locals.auditOp || skipModel(name)) return;
    const op = doc.$locals.auditOp;
    const before = doc.$locals.auditBefore;
    doc.$locals.auditOp = null;
    doc.$locals.auditBefore = null;
    fire({ modelName: name, operation: op, before, after: doc.toObject({ depopulate: true }) });
  });

  // ---------------------------------------------------------------- insertMany
  schema.post('insertMany', function auditPostInsertMany(docs) {
    const name = this.modelName;
    if (skipModel(name) || !Array.isArray(docs)) return;
    docs.slice(0, MAX_DOCS).forEach((d) => fire({
      modelName: name, operation: 'create', after: d.toObject ? d.toObject({ depopulate: true }) : d, bulk: true, truncated: docs.length > MAX_DOCS,
    }));
  });

  // ---------------------------------------------------------------- query updates
  const UPDATE_OPS = ['findOneAndUpdate', 'updateOne', 'updateMany', 'findOneAndReplace', 'replaceOne'];
  register(schema, UPDATE_OPS, { document: false, query: true }, {
    kind: 'pre',
    async handler() {
      if (skipQuery(this)) return;
      try {
        const single = this.op !== 'updateMany';
        this.$auditBefore = await this.model.find(filterOf(this)).limit(single ? 1 : MAX_DOCS + 1).lean();
      } catch (e) {
        logErr(e);
      }
    },
  });
  register(schema, UPDATE_OPS, { document: false, query: true }, {
    kind: 'post',
    handler() {
      const before = this.$auditBefore;
      this.$auditBefore = null;
      if (!before || !before.length || skipQuery(this)) return;
      const { model } = this;
      const name = model.modelName;
      const bulk = this.op === 'updateMany';
      const truncated = before.length > MAX_DOCS;
      const subset = before.slice(0, MAX_DOCS);
      (async () => {
        const after = await model.find({ _id: { $in: subset.map((d) => d._id) } }).lean();
        const byId = new Map(after.map((d) => [String(d._id), d]));
        subset.forEach((b) => fire({ modelName: name, operation: 'update', before: b, after: byId.get(String(b._id)), bulk, truncated }));
      })().catch(logErr);
    },
  });

  // ---------------------------------------------------------------- query deletes
  const DELETE_OPS = ['deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove'];
  register(schema, DELETE_OPS, { document: false, query: true }, {
    kind: 'pre',
    async handler() {
      if (skipQuery(this)) return;
      try {
        const single = this.op !== 'deleteMany';
        this.$auditBefore = await this.model.find(filterOf(this)).limit(single ? 1 : MAX_DOCS + 1).lean();
      } catch (e) {
        logErr(e);
      }
    },
  });
  register(schema, DELETE_OPS, { document: false, query: true }, {
    kind: 'post',
    handler() {
      const before = this.$auditBefore;
      this.$auditBefore = null;
      if (!before || !before.length || skipQuery(this)) return;
      const name = this.model.modelName;
      const bulk = this.op === 'deleteMany';
      before.slice(0, MAX_DOCS).forEach((b) => fire({ modelName: name, operation: 'delete', before: b, bulk, truncated: before.length > MAX_DOCS }));
    },
  });

  // ---------------------------------------------------------------- document.deleteOne() / remove()
  // Mongoose 7+ runs QUERY middleware for doc.deleteOne(), already handled above. Older versions
  // only run document middleware, so register those hooks for Mongoose 5/6 only (avoids duplicates).
  const docDeleteOps = MONGOOSE_MAJOR >= 7 ? [] : ['deleteOne', 'remove'];
  register(schema, docDeleteOps, { document: true, query: false }, {
    kind: 'pre',
    handler() {
      const name = this.constructor && this.constructor.modelName;
      if (isSub(this) || skipModel(name)) return;
      this.$locals.auditDeleteBefore = this.toObject({ depopulate: true });
    },
  });
  register(schema, docDeleteOps, { document: true, query: false }, {
    kind: 'post',
    handler(doc) {
      const d = doc || this;
      const name = d.constructor && d.constructor.modelName;
      if (!d.$locals || !d.$locals.auditDeleteBefore || skipModel(name)) return;
      const before = d.$locals.auditDeleteBefore;
      d.$locals.auditDeleteBefore = null;
      fire({ modelName: name, operation: 'delete', before });
    },
  });
};
