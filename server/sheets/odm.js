import bcrypt from 'bcryptjs';
import { sheetCollection } from './client.js';

// A tiny Mongo-like ODM over the Apps Script. Queries are matched in Node, so
// the usual operators ($or, $regex, comparisons) behave the same as in MongoDB.

const hydrate = (spec, row) => {
  if (!row) return null;
  const out = { ...row, _id: row.id };
  for (const [field, fallback] of Object.entries(spec.defaults || {})) {
    if (out[field] === undefined || out[field] === null || out[field] === '') {
      out[field] = typeof fallback === 'function' ? fallback() : fallback;
    }
  }
  for (const field of spec.dates || []) {
    if (out[field]) out[field] = new Date(out[field]);
  }
  for (const field of spec.numbers || []) {
    if (out[field] !== undefined && out[field] !== '') out[field] = Number(out[field]);
  }
  for (const field of spec.booleans || []) {
    out[field] = out[field] === true || String(out[field]).toLowerCase() === 'true';
  }
  for (const field of spec.arrays || []) {
    const value = out[field];
    if (Array.isArray(value)) continue;
    out[field] = value ? String(value).split(',').map((v) => v.trim()).filter(Boolean) : [];
  }
  return out;
};

const asComparable = (v) => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const s = String(v ?? '');
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
  }
  return s;
};

const eq = (a, b) => {
  if (a instanceof Date) a = a.toISOString();
  if (b instanceof Date) b = b.toISOString();
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  if (a === undefined || a === null) a = '';
  if (b === undefined || b === null) b = '';
  return String(a) === String(b);
};

function matchOps(value, cond) {
  for (const [op, target] of Object.entries(cond)) {
    if (op === '$in') {
      if (!target.some((t) => eq(value, t))) return false;
    } else if (op === '$ne') {
      if (eq(value, target)) return false;
    } else if (op === '$gt') {
      if (!(asComparable(value) > asComparable(target))) return false;
    } else if (op === '$gte') {
      if (!(asComparable(value) >= asComparable(target))) return false;
    } else if (op === '$lt') {
      if (!(asComparable(value) < asComparable(target))) return false;
    } else if (op === '$lte') {
      if (!(asComparable(value) <= asComparable(target))) return false;
    } else if (op === '$regex') {
      if (!new RegExp(String(target), cond.$options || '').test(String(value))) return false;
    } else if (op === '$exists') {
      const present = value !== undefined && value !== null && value !== '';
      if (present !== Boolean(target)) return false;
    } else {
      return false;
    }
  }
  return true;
}

export function matches(doc, query) {
  for (const [key, cond] of Object.entries(query || {})) {
    if (key === '$or') {
      if (!cond.some((sub) => matches(doc, sub))) return false;
      continue;
    }
    if (key === '$and') {
      if (!cond.every((sub) => matches(doc, sub))) return false;
      continue;
    }
    const value = doc[key];
    if (cond instanceof RegExp) {
      if (!cond.test(String(value ?? ''))) return false;
    } else if (cond !== null && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      if (!matchOps(value, cond)) return false;
    } else if (!eq(value, cond)) {
      return false;
    }
  }
  return true;
}

function applySort(docs, sort) {
  if (!sort) return docs;
  const entries = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [field, dir] of entries) {
      const cmp = asComparable(a[field]) < asComparable(b[field]) ? -1 : asComparable(a[field]) > asComparable(b[field]) ? 1 : 0;
      if (cmp !== 0) return dir < 0 ? -cmp : cmp;
    }
    return 0;
  });
}

export class SheetsQuery {
  constructor(run, single = false) {
    this._run = run;
    this._single = single;
    this._opts = { sort: null, skip: 0, limit: 0, populate: [], lean: false };
    // The Supabase ODM compiles sort/skip/limit into SQL and passes them here so
    // they are not applied a second time in Node. The Sheets ODM ignores this.
    this._preApplied = false;
  }

  sort(spec) {
    this._opts.sort = spec;
    return this;
  }

  skip(n) {
    this._opts.skip = n;
    return this;
  }

  limit(n) {
    this._opts.limit = n;
    return this;
  }

  // Mongo chainables that are no-ops here (all columns are already returned).
  select() {
    return this;
  }

  populate(field, selection) {
    this._opts.populate.push({ field, selection });
    return this;
  }

  lean() {
    this._opts.lean = true;
    return this;
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  catch(reject) {
    return this._execute().catch(reject);
  }

  async _execute() {
    let docs = await this._run();
    docs = docs.filter(Boolean);
    if (!this._preApplied) {
      docs = applySort(docs, this._opts.sort);
      if (this._opts.skip) docs = docs.slice(this._opts.skip);
      if (this._opts.limit) docs = docs.slice(0, this._opts.limit);
    }
    for (const { field, selection } of this._opts.populate) {
      docs = await Promise.all(docs.map((d) => d.populate(field, selection)));
    }
    if (this._single) {
      const doc = docs[0] ?? null;
      return this._opts.lean ? (doc ? doc.lean() : null) : doc;
    }
    return this._opts.lean ? docs.map((d) => d.lean()) : docs;
  }
}

export function createCollection(spec) {
  const name = spec.name;

  const all = async () => (await sheetCollection.find(name, {})).map((row) => hydrate(spec, row));
  const makeDoc = (row) => {
    const data = hydrate(spec, row);
    const state = { data, dirty: {} };
    const self = {
      _id: data._id,
      save: async () => {
        const patch = { ...state.dirty };
        if (spec.hashesPassword && patch.password !== undefined) {
          patch.password = await bcrypt.hash(String(patch.password), 12);
          patch.passwordChangedAt = new Date(Date.now() - 1000);
        }
        delete patch._id;
        delete patch.id;
        const updated = await sheetCollection.updateById(name, self._id, patch);
        if (updated) state.data = hydrate(spec, updated);
        state.dirty = {};
        return self;
      },
      toPublicJSON: () => spec.publicJSON(state.data),
      checkPassword: (candidate) => bcrypt.compare(candidate, state.data.password ?? ''),
      changedPasswordAfter: (iat) => {
        const changed = state.data.passwordChangedAt;
        if (!changed) return false;
        return Math.floor(new Date(changed).getTime() / 1000) > iat;
      },
      equals: (other) => String(self._id) === String(other?._id ?? other),
      deleteOne: async () => {
        await sheetCollection.deleteById(name, self._id);
      },
      lean: () => ({ ...state.data, _id: state.data.id }),
      toObject: () => ({ ...state.data, _id: state.data.id }),
      populate: async (field, selection) => {
        const ref = spec.populates?.[field];
        if (!ref || !state.data[field]) return self;
        const rows = await ref.all();
        const target = rows.find((r) => String(r.id) === String(state.data[field]));
        if (target) {
          const plain = { _id: target.id };
          const fields = selection ? String(selection).split(/\s+/) : null;
          for (const [k, v] of Object.entries(target)) {
            if (fields && !fields.includes(k)) continue;
            plain[k] = v;
          }
          state.data[field] = plain;
        }
        return self;
      },
      _state: state,
    };

    return new Proxy(self, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return state.data[prop];
      },
      set(target, prop, value) {
        if (prop in target && typeof target[prop] === 'function') {
          target[prop] = value;
          return true;
        }
        state.data[prop] = value;
        state.dirty[prop] = value;
        return true;
      },
      has: (target, prop) => prop in target || prop in state.data,
      ownKeys: (target) => [...new Set([...Object.keys(target), ...Object.keys(state.data)])],
      getOwnPropertyDescriptor(target, prop) {
        if (prop in target) return { configurable: true, enumerable: true, value: target[prop], writable: true };
        if (prop in state.data) return { configurable: true, enumerable: true, value: state.data[prop], writable: true };
        return undefined;
      },
    });
  };

  return {
    name,
    all,
    create: async (doc) => {
      const data = hydrate(spec, { ...doc });
      if (spec.hashesPassword && data.password) data.password = await bcrypt.hash(String(data.password), 12);
      delete data._id;
      const row = await sheetCollection.insertOne(name, data);
      return makeDoc(row);
    },
    insertMany: async (docs) => {
      const out = [];
      for (const doc of docs) out.push(await this.create(doc));
      return out;
    },
    find: (query = {}) => new SheetsQuery(async () => (await all()).filter((d) => matches(d, query)).map(makeDoc)),
    findOne: (query = {}) =>
      new SheetsQuery(async () => {
        const found = (await all()).filter((d) => matches(d, query));
        return found.length ? [makeDoc(found[0])] : [];
      }, true),
    findById: (id) =>
      new SheetsQuery(async () => {
        const found = (await all()).find((d) => String(d.id) === String(id));
        return found ? [makeDoc(found)] : [];
      }, true),
    findByIdAndUpdate: async (id, update) => {
      const row = await sheetCollection.updateById(name, id, update);
      return row ? makeDoc(row) : null;
    },
    findByIdAndDelete: async (id) => {
      const found = (await all()).find((d) => String(d.id) === String(id));
      if (!found) return null;
      await sheetCollection.deleteById(name, id);
      return makeDoc(found);
    },
    findOneAndDelete: async (query = {}) => {
      const found = (await all()).find((d) => matches(d, query));
      if (!found) return null;
      await sheetCollection.deleteById(name, found.id);
      return makeDoc(found);
    },
    findOneAndUpdate: async (query = {}, update = {}, opts = {}) => {
      const found = (await all()).find((d) => matches(d, query));
      if (found) {
        const row = await sheetCollection.updateById(name, found.id, update);
        return row ? makeDoc(row) : null;
      }
      if (!opts.upsert) return null;
      const merged = { ...query, ...update };
      delete merged._id;
      const data = hydrate(spec, merged);
      if (spec.hashesPassword && data.password) data.password = await bcrypt.hash(String(data.password), 12);
      return makeDoc(await sheetCollection.insertOne(name, data));
    },
    countDocuments: async (query = {}) => (await all()).filter((d) => matches(d, query)).length,
    exists: async (query = {}) => (await all()).some((d) => matches(d, query)),
    updateMany: async (query = {}, update = {}) => {
      const patch = update.$set || update;
      const found = (await all()).filter((d) => matches(d, query));
      for (const d of found) await sheetCollection.updateById(name, d.id, patch);
      return found.length;
    },
    deleteMany: async (query = {}) => {
      const found = (await all()).filter((d) => matches(d, query));
      for (const d of found) await sheetCollection.deleteById(name, d.id);
      return found.length;
    },
    aggregate: async (pipeline) => {
      const group = pipeline.find((s) => s.$group);
      if (!group) return [];
      const rows = (await all()).filter((d) => matches(d, group.$match || {}));
      const totals = {};
      for (const [out, expr] of Object.entries(group)) {
        if (out === '_id') continue;
        if (expr.$sum) {
          const field = typeof expr.$sum === 'string' ? expr.$sum.replace('$', '') : null;
          totals[out] = field ? rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0) : rows.length;
        }
      }
      return [{ _id: null, ...totals }];
    },
  };
}
