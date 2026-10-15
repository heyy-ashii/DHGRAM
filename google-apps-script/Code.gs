/**
 * DHGRAM - Google Sheets datastore.
 *
 * Serves the whole app (users, otps, conversations, messages, posts) over a
 * JSON API. The Express API talks to this script, so the frontend contract is
 * unchanged. MongoDB is not required.
 *
 * IMPORTANT: keep the spreadsheet itself PRIVATE (Share > Restricted). This
 * script runs as the owner, so it can read the private sheet while the Web App
 * stays reachable. The token below is what protects the data.
 *
 * SETUP (one time)
 *   1. Project Settings > Script properties, add:
 *        SHEETS_TOKEN = a long random string (also set as SHEETS_API_TOKEN in the API .env)
 *   2. Run setup() once to create every tab with the right headers.
 *   3. Deploy > New deployment > Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *
 * The token is compared in constant time and never logged.
 */

// Column order per tab. The Node layer maps these names to the shape it expects.
var COLLECTIONS = {
  Users: ['id', 'name', 'username', 'regNo', 'email', 'password', 'role', 'status', 'suspendedUntil', 'emailVerified', 'passwordChangedAt', 'lastLoginAt', 'failedLoginAttempts', 'lockUntil', 'createdAt', 'updatedAt'],
  Otps: ['id', 'email', 'purpose', 'codeHash', 'attempts', 'expiresAt', 'createdAt', 'updatedAt'],
  Conversations: ['id', 'user', 'status', 'lastMessage', 'lastMessageAt', 'unreadForAdmin', 'unreadForUser', 'createdAt', 'updatedAt'],
  Messages: ['id', 'conversation', 'sender', 'senderRole', 'body', 'createdAt', 'updatedAt'],
  Posts: ['id', 'author', 'body', 'likes', 'hidden', 'createdAt', 'updatedAt'],
  Groups: ['id', 'name', 'createdBy', 'members', 'lastMessage', 'lastMessageAt', 'createdAt', 'updatedAt'],
  GroupMembers: ['id', 'group', 'user', 'createdAt', 'updatedAt'],
  GroupMessages: ['id', 'group', 'sender', 'body', 'createdAt', 'updatedAt'],
  Stories: ['id', 'author', 'imageUrl', 'caption', 'createdAt', 'updatedAt'],
  StoryViews: ['id', 'story', 'viewer', 'createdAt', 'updatedAt'],
  Reports: ['id', 'reporter', 'reporterName', 'kind', 'targetId', 'targetLabel', 'reason', 'details', 'status', 'handledBy', 'handledAt', 'createdAt', 'updatedAt'],
  Games: ['id', 'white', 'black', 'invitedBy', 'status', 'result', 'resultReason', 'moves', 'fen', 'drawOfferedBy', 'acceptedAt', 'finishedAt', 'lastMoveAt', 'createdAt', 'updatedAt'],
};

// Values that must stay JSON, not strings.
var JSON_COLUMNS = { likes: true, members: true, moves: true };
// Values that must be stored as booleans.
var BOOLEAN_COLUMNS = { emailVerified: true, hidden: true };

/* ------------------------------------------------------------------ */
/* One-time setup                                                      */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(COLLECTIONS).forEach(function (name) {
    var columns = COLLECTIONS[name];
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold');
    }
  });
  return 'Tabs ready: ' + Object.keys(COLLECTIONS).join(', ');
}

/* ------------------------------------------------------------------ */
/* HTTP entry points                                                   */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return handle_(e, 'GET');
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ error: 'Invalid JSON body' });
  }
  return handle_(e, body.action || 'GET', body);
}

function handle_(e, action, body) {
  var params = (e && e.parameter) || {};

  if (action === 'health') return json_({ ok: true, collections: Object.keys(COLLECTIONS) });
  if (!isAuthorized_(params.token)) return json_({ error: 'Unauthorized' });

  try {
    switch (action) {
      // --- generic collection actions ---
      case 'find': return json_({ rows: find_(body) });
      case 'findOne': return json_({ row: findOne_(body) });
      case 'insertOne': return json_({ row: insertOne_(body) });
      case 'updateOne': return json_({ matched: updateOne_(body) });
      case 'updateById': return json_({ row: updateById_(body) });
      case 'upsert': return json_({ row: upsert_(body) });
      case 'deleteOne': return json_({ deleted: deleteOne_(body) });
      case 'deleteById': return json_({ deleted: deleteById_(body) });
      case 'deleteMany': return json_({ deleted: deleteMany_(body) });
      case 'countDocuments': return json_({ total: find_(body).length });
      case 'sum': return json_({ total: sum_(body) });
      case 'clear': return json_({ deleted: clear_(body) });
      default: return json_({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return json_({ error: String(err && err.message ? err.message : err) });
  }
}

/* ------------------------------------------------------------------ */
/* Generic collection operations                                       */
/* ------------------------------------------------------------------ */

function find_(body) {
  return readRows_(body.collection).filter(function (row) { return match_(row, body.query || {}); });
}

function findOne_(body) {
  var rows = find_(body);
  return rows.length ? rows[0] : null;
}

function insertOne_(body) {
  var name = body.collection;
  var now = new Date().toISOString();
  var doc = normalize_(name, body.doc || {});
  if (!doc.id) doc.id = Utilities.getUuid();
  if (!doc.createdAt) doc.createdAt = now;
  doc.updatedAt = now;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheetFor_(name).appendRow(columns_(name).map(function (col) { return serialize_(col, doc[col]); }));
  } finally {
    lock.releaseLock();
  }
  return doc;
}

function updateOne_(body) {
  var name = body.collection;
  var patch = normalize_(name, body.update || {});
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheetFor_(name);
    var values = sheet.getDataRange().getValues();
    var header = values[0];
    var matched = 0;
    for (var i = 1; i < values.length; i++) {
      var row = rowToObject_(header, values[i]);
      if (!match_(row, body.query || {})) continue;
      matched += 1;
      for (var key in patch) row[key] = patch[key];
      row.updatedAt = new Date().toISOString();
      sheet.getRange(i + 1, 1, 1, header.length).setValues([header.map(function (col) { return serialize_(col, row[col]); })]);
      if (body.single) break;
    }
    return matched;
  } finally {
    lock.releaseLock();
  }
}

function updateById_(body) {
  var name = body.collection;
  var patch = normalize_(name, body.update || {});
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheetFor_(name);
    var values = sheet.getDataRange().getValues();
    var header = values[0];
    var idCol = header.indexOf('id');
    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] !== body.id) continue;
      var row = rowToObject_(header, values[i]);
      for (var key in patch) row[key] = patch[key];
      row.updatedAt = new Date().toISOString();
      sheet.getRange(i + 1, 1, 1, header.length).setValues([header.map(function (col) { return serialize_(col, row[col]); })]);
      return row;
    }
    return null;
  } finally {
    lock.releaseLock();
  }
}

function upsert_(body) {
  var found = findOne_({ collection: body.collection, query: body.query || {} });
  if (found) return updateById_({ collection: body.collection, id: found.id, update: body.update || {} });

  var doc = {};
  var sources = [body.query || {}, body.insert || {}, body.update || {}];
  sources.forEach(function (src) {
    for (var key in src) {
      var v = src[key];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) continue;
      doc[key] = v;
    }
  });
  return insertOne_({ collection: body.collection, doc: doc });
}

function deleteOne_(body) {
  var name = body.collection;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheetFor_(name);
    var values = sheet.getDataRange().getValues();
    var header = values[0];
    for (var i = 1; i < values.length; i++) {
      if (match_(rowToObject_(header, values[i]), body.query || {})) {
        sheet.deleteRow(i + 1);
        return 1;
      }
    }
    return 0;
  } finally {
    lock.releaseLock();
  }
}

function deleteById_(body) {
  var name = body.collection;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheetFor_(name);
    var values = sheet.getDataRange().getValues();
    var idCol = values[0].indexOf('id');
    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] === body.id) {
        sheet.deleteRow(i + 1);
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

function deleteMany_(body) {
  var name = body.collection;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheetFor_(name);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return 0;
    var header = values[0];
    var keep = [header];
    var deleted = 0;
    for (var i = 1; i < values.length; i++) {
      if (match_(rowToObject_(header, values[i]), body.query || {})) deleted += 1;
      else keep.push(values[i]);
    }
    if (!deleted) return 0;
    sheet.getRange(2, 1, values.length - 1, header.length).clearContent();
    if (keep.length > 1) sheet.getRange(2, 1, keep.length - 1, header.length).setValues(keep.slice(1));
    return deleted;
  } finally {
    lock.releaseLock();
  }
}

function sum_(body) {
  return find_({ collection: body.collection, query: body.query || {} })
    .reduce(function (acc, row) { return acc + (Number(row[body.field]) || 0); }, 0);
}

function clear_(body) {
  var name = body.collection;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheetFor_(name);
    var last = sheet.getLastRow();
    if (last > 1) sheet.deleteRows(2, last - 1);
    return Math.max(0, last - 1);
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Query matching                                                      */
/* ------------------------------------------------------------------ */

function match_(doc, query) {
  for (var key in query) {
    var cond = query[key];
    if (key === '$or') {
      if (!cond.some(function (sub) { return match_(doc, sub); })) return false;
      continue;
    }
    if (key === '$and') {
      if (!cond.every(function (sub) { return match_(doc, sub); })) return false;
      continue;
    }
    var value = doc[key];
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      if (!opMatch_(value, cond)) return false;
    } else if (!eq_(value, cond)) {
      return false;
    }
  }
  return true;
}

function opMatch_(value, cond) {
  for (var op in cond) {
    var target = cond[op];
    if (op === '$in') {
      if (!target.some(function (t) { return eq_(value, t); })) return false;
    } else if (op === '$ne') {
      if (eq_(value, target)) return false;
    } else if (op === '$gt') {
      if (!(compare_(value, target) > 0)) return false;
    } else if (op === '$gte') {
      if (!(compare_(value, target) >= 0)) return false;
    } else if (op === '$lt') {
      if (!(compare_(value, target) < 0)) return false;
    } else if (op === '$lte') {
      if (!(compare_(value, target) <= 0)) return false;
    } else if (op === '$regex') {
      if (!new RegExp(String(target), cond.$options || '').test(String(value))) return false;
    } else if (op === '$exists') {
      var present = value !== undefined && value !== null && value !== '';
      if (present !== Boolean(target)) return false;
    } else {
      return false;
    }
  }
  return true;
}

function eq_(value, target) {
  if (value === undefined || value === null) value = '';
  if (target === undefined || target === null) target = '';
  if (value instanceof Date) value = value.toISOString();
  if (target instanceof Date) target = target.toISOString();
  if (typeof value === 'boolean' || typeof target === 'boolean') return Boolean(value) === Boolean(target);
  return String(value) === String(target);
}

function compare_(value, target) {
  var a = asComparable_(value);
  var b = asComparable_(target);
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function asComparable_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  var s = String(v === undefined || v === null ? '' : v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    var t = Date.parse(s);
    if (!isNaN(t)) return t;
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Sheet <-> object helpers                                            */
/* ------------------------------------------------------------------ */

function columns_(name) {
  var columns = COLLECTIONS[name];
  if (!columns) throw new Error('Unknown collection: ' + name);
  return columns;
}

function sheetFor_(name) {
  columns_(name);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing "' + name + '" tab. Run setup() once.');
  return sheet;
}

function readRows_(name) {
  var values = sheetFor_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var idCol = header.indexOf('id');
  return values.slice(1)
    .filter(function (row) { return row[idCol]; })
    .map(function (row) { return rowToObject_(header, row); });
}

function rowToObject_(header, row) {
  var obj = {};
  header.forEach(function (col, i) { obj[col] = deserialize_(col, row[i]); });
  return obj;
}

function normalize_(name, data) {
  data = data || {};
  var out = {};
  columns_(name).forEach(function (col) {
    if (col === 'id' || col === 'createdAt' || col === 'updatedAt') return;
    if (data[col] === undefined) return;
    out[col] = data[col];
  });
  return out;
}

function serialize_(col, value) {
  if (value === undefined || value === null) return '';
  if (JSON_COLUMNS[col]) return JSON.stringify(value || []);
  if (BOOLEAN_COLUMNS[col]) return Boolean(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

function deserialize_(col, value) {
  if (JSON_COLUMNS[col]) {
    if (!value) return [];
    try {
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return String(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
  }
  if (BOOLEAN_COLUMNS[col]) {
    if (value === '' || value === null || value === undefined) return false;
    return value === true || String(value).toLowerCase() === 'true';
  }
  if (value instanceof Date) return value.toISOString();
  if (value === '' || value === null) return '';
  return value;
}

/* ------------------------------------------------------------------ */
/* Security / response helpers                                         */
/* ------------------------------------------------------------------ */

function isAuthorized_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('SHEETS_TOKEN');
  if (!expected || !token) return false;
  if (token.length !== expected.length) return false;
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
