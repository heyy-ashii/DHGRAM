import { createServer } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.ROSTER_CSV = 'AD.NO,NAME,PHONE,EMAIL\n3411,New Student,,\n3412,Chat Student,,\n';
// This suite runs on the fake in-process Sheets API. Blank the Supabase settings
// that .env may carry: datastore() prefers Supabase, which would send the tests
// to a hosted database. Empty strings are deliberate; dotenv keeps existing keys.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_DB_URL = '';

const TOKEN = 'test-sheets-token';

// Stand-in for the deployed Apps Script: same actions and JSON shapes as Code.gs,
// backed by in-memory tabs. Query matching happens on the Node side, so this only
// needs to store rows and filter with the operators the app actually sends.
function startFakeSheet() {
  const tabs = {
    Users: [],
    Otps: [],
    Conversations: [],
    Messages: [],
    Posts: [],
    PeerConversations: [],
    PeerMessages: [],
    Groups: [],
    GroupMembers: [],
    GroupMessages: [],
  };
  const JSON_COLUMNS = { likes: true, members: true };
  const BOOLEAN_COLUMNS = { emailVerified: true, hidden: true };

  const eq = (a, b) => {
    if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
    if (a == null) a = '';
    if (b == null) b = '';
    return String(a) === String(b);
  };
  const cmp = (a, b) => {
    const na = /^\d{4}-\d{2}-\d{2}/.test(String(a)) ? Date.parse(a) : Number(a);
    const nb = /^\d{4}-\d{2}-\d{2}/.test(String(b)) ? Date.parse(b) : Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na < nb ? -1 : na > nb ? 1 : 0;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  };
  const opMatch = (value, cond) => {
    for (const [op, target] of Object.entries(cond)) {
      if (op === '$in' && !target.some((t) => eq(value, t))) return false;
      if (op === '$ne' && eq(value, target)) return false;
      if (op === '$gt' && !(cmp(value, target) > 0)) return false;
      if (op === '$gte' && !(cmp(value, target) >= 0)) return false;
      if (op === '$lt' && !(cmp(value, target) < 0)) return false;
      if (op === '$lte' && !(cmp(value, target) <= 0)) return false;
      if (op === '$regex' && !new RegExp(String(target), cond.$options || '').test(String(value))) return false;
      if (op === '$exists') {
        const present = value !== undefined && value !== null && value !== '';
        if (present !== Boolean(target)) return false;
      }
    }
    return true;
  };
  const match = (doc, query) => {
    for (const [key, cond] of Object.entries(query || {})) {
      if (key === '$or') {
        if (!cond.some((sub) => match(doc, sub))) return false;
        continue;
      }
      if (key === '$and') {
        if (!cond.every((sub) => match(doc, sub))) return false;
        continue;
      }
      const value = doc[key];
      if (cond instanceof RegExp) {
        if (!cond.test(String(value ?? ''))) return false;
      } else if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        if (!opMatch(value, cond)) return false;
      } else if (!eq(value, cond)) {
        return false;
      }
    }
    return true;
  };
  const deserialize = (col, v) => {
    if (JSON_COLUMNS[col]) {
      if (!v) return [];
      try {
        return JSON.parse(v);
      } catch {
        return [];
      }
    }
    if (BOOLEAN_COLUMNS[col]) return v === true || String(v).toLowerCase() === 'true';
    return v ?? '';
  };
  const rowToObject = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, deserialize(k, v)]));

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      const q = url.searchParams;
      const send = (payload) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      const action = req.method === 'POST' ? JSON.parse(body || '{}').action : q.get('action') || 'GET';
      const data = req.method === 'POST' ? JSON.parse(body || '{}') : {};

      if (action === 'health') return send({ ok: true });
      if (q.get('token') !== TOKEN) return send({ error: 'Unauthorized' });

      const rowsOf = (name) => {
        if (!tabs[name]) throw new Error('Unknown collection: ' + name);
        return tabs[name];
      };
      const now = () => new Date().toISOString();

      try {
        switch (action) {
          case 'find':
            return send({ rows: rowsOf(data.collection).map(rowToObject).filter((r) => match(r, data.query)) });
          case 'findOne': {
            const hit = rowsOf(data.collection).map(rowToObject).find((r) => match(r, data.query));
            return send({ row: hit || null });
          }
          case 'insertOne': {
            const row = { ...data.doc, id: data.doc.id || crypto.randomUUID(), createdAt: now(), updatedAt: now() };
            for (const col of Object.keys(JSON_COLUMNS)) if (Array.isArray(row[col])) row[col] = JSON.stringify(row[col]);
            rowsOf(data.collection).push(row);
            return send({ row: rowToObject(row) });
          }
          case 'updateOne':
          case 'updateById': {
            const rows = rowsOf(data.collection);
            let matched = 0;
            let updated = null;
            for (const row of rows) {
              const ok = action === 'updateById' ? row.id === data.id : match(rowToObject(row), data.query);
              if (!ok) continue;
              Object.assign(row, data.update, { updatedAt: now() });
              for (const col of Object.keys(JSON_COLUMNS)) if (Array.isArray(row[col])) row[col] = JSON.stringify(row[col]);
              matched += 1;
              updated = rowToObject(row);
              if (data.single || action === 'updateById') break;
            }
            return send(action === 'updateById' ? { row: updated } : { matched });
          }
          case 'upsert': {
            const rows = rowsOf(data.collection);
            const hit = rows.find((r) => match(rowToObject(r), data.query));
            if (hit) {
              Object.assign(hit, data.update, { updatedAt: now() });
              return send({ row: rowToObject(hit) });
            }
            const row = { ...data.query, ...data.insert, ...data.update, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
            rows.push(row);
            return send({ row: rowToObject(row) });
          }
          case 'deleteOne':
          case 'deleteById': {
            const rows = rowsOf(data.collection);
            const idx = rows.findIndex((r) => (action === 'deleteById' ? r.id === data.id : match(rowToObject(r), data.query)));
            if (idx === -1) return send({ deleted: 0 });
            rows.splice(idx, 1);
            return send({ deleted: 1 });
          }
          case 'deleteMany': {
            const rows = rowsOf(data.collection);
            const keep = rows.filter((r) => !match(rowToObject(r), data.query));
            const deleted = rows.length - keep.length;
            tabs[data.collection] = keep;
            return send({ deleted });
          }
          case 'countDocuments':
            return send({ total: rowsOf(data.collection).map(rowToObject).filter((r) => match(r, data.query)).length });
          case 'sum':
            return send({ total: rowsOf(data.collection).reduce((acc, r) => acc + (Number(rowToObject(r)[data.field]) || 0), 0) });
          case 'clear': {
            const n = rowsOf(data.collection).length;
            tabs[data.collection] = [];
            return send({ deleted: n });
          }
          default:
            return send({ error: 'Unknown action: ' + action });
        }
      } catch (err) {
        return send({ error: String(err.message || err) });
      }
    });
  });
  return server;
}

let app;
let sheet;

beforeAll(async () => {
  sheet = startFakeSheet();
  await new Promise((resolve) => sheet.listen(0, '127.0.0.1', resolve));
  process.env.SHEETS_API_URL = `http://127.0.0.1:${sheet.address().port}/exec`;
  process.env.SHEETS_API_TOKEN = TOKEN;

  const { createApp } = await import('../app.js');
  // No connect: Sheets mode must never touch MongoDB.
  app = createApp({ connect: () => Promise.reject(new Error('MongoDB should not be used in sheets mode')) });
}, 60000);

afterAll(async () => {
  await new Promise((resolve) => sheet.close(resolve));
});

const adminLogin = async () => {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ identifier: 'admin', password: 'adminpass1' });
  return { agent, res };
};

describe('DHGRAM on Google Sheets only', () => {
  it('reports the sheets datastore', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.body.datastore).toBe('sheets');
  });

  it('creates an account from the roster, logs in and reads /me', async () => {
    const agent = request.agent(app);
    const ok = await agent.post('/api/v1/auth/signup').send({ name: 'New Student', admissionNo: '3411' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.user.username).toBe('new.student');
    expect(ok.body.data.user.role).toBe('user');
    expect(ok.body.data.user).not.toHaveProperty('password');

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data.user.username).toBe('new.student');

    const login = await request(app).post('/api/v1/auth/login').send({ identifier: 'new.student', password: '3411' });
    expect(login.status).toBe(200);

    const bad = await request(app).post('/api/v1/auth/login').send({ identifier: 'new.student', password: 'wrongpass' });
    expect(bad.status).toBe(401);
  });

  it('rejects a name or admission number that is not on the roster', async () => {
    expect((await request(app).post('/api/v1/auth/signup').send({ name: 'Nobody Here', admissionNo: '3411' })).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/signup').send({ name: 'New Student', admissionNo: '9999' })).status).toBe(403);
  });

  it('seeds an admin account used by the support chat flow', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Admin', username: 'admin', email: 'admin@test.dev', password: 'adminpass1', role: 'admin', emailVerified: true });

    const { res } = await adminLogin();
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');
  });

  it('runs the chat flow', async () => {
    const user = request.agent(app);
    await user.post('/api/v1/auth/signup').send({ name: 'Chat Student', admissionNo: '3412' });

    const sent = await user.post('/api/v1/chat/me/messages').send({ body: 'Hello admin' });
    expect(sent.status).toBe(201);

    const mine = await user.get('/api/v1/chat/me');
    expect(mine.body.data.messages[0].body).toBe('Hello admin');

    const { agent: admin } = await adminLogin();
    const convos = await admin.get('/api/v1/chat/conversations');
    expect(convos.body.data.conversations[0]).toMatchObject({ unreadForAdmin: 1, lastMessage: 'Hello admin' });
    expect(convos.body.data.conversations[0].user.username).toBe('chat.student');
    const cid = convos.body.data.conversations[0]._id;

    await admin.post(`/api/v1/chat/conversations/${cid}/messages`).send({ body: 'Hi! How can I help?' });
    const after = await user.get('/api/v1/chat/me');
    expect(after.body.data.messages.map((m) => m.senderRole)).toEqual(['user', 'admin']);

    await admin.patch(`/api/v1/chat/conversations/${cid}`).send({ status: 'closed' });
    expect((await admin.get('/api/v1/chat/conversations?status=closed')).body.data.conversations).toHaveLength(1);
  });

  it('drops chat messages older than the retention window', async () => {
    const { Message } = await import('../models/Chat.js');
    const user = request.agent(app);
    await user.post('/api/v1/auth/login').send({ identifier: 'chat.student', password: '3412' });
    await user.post('/api/v1/chat/me/messages').send({ body: 'soon to be purged' });
    const conv = (await user.get('/api/v1/chat/me')).body.data.conversation;
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await Message.updateMany({ conversation: conv._id }, { $set: { createdAt: old } });

    const thread = await user.get('/api/v1/chat/me');
    expect(thread.body.data.messages).toHaveLength(0);
    expect(thread.body.data.conversation.lastMessage).toBe('');
  });

  it('shares and moderates posts through the sheet', async () => {
    const user = request.agent(app);
    await user.post('/api/v1/auth/login').send({ identifier: 'chat.student', password: '3412' });

    expect((await request(app).get('/api/v1/posts')).status).toBe(200);
    const created = await user.post('/api/v1/posts').send({ body: 'Hello from the sheet' });
    expect(created.status).toBe(201);
    const id = created.body.data.post._id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.body.data.post).toMatchObject({ likes: 0, likedByMe: false, mine: true });
    expect(created.body.data.post.author.username).toBe('chat.student');

    const liked = await user.post(`/api/v1/posts/${id}/like`);
    expect(liked.body.data.post).toMatchObject({ likes: 1, likedByMe: true });

    const guest = await request(app).get('/api/v1/posts');
    expect(guest.body.total).toBe(1);
    expect(guest.body.data.posts[0].likedByMe).toBe(false);

    const { agent: admin } = await adminLogin();
    const hidden = await admin.patch(`/api/v1/posts/${id}`).send({ hidden: true });
    expect(hidden.body.data.post.hidden).toBe(true);
    expect((await request(app).get('/api/v1/posts')).body.total).toBe(0);

    expect((await user.delete(`/api/v1/posts/${id}`)).status).toBe(204);
  });

  it('maps an unreachable sheet to 503, not a 500', async () => {
    const { sheetCollection } = await import('../sheets/client.js');
    const { config } = await import('../config.js');
    const original = config.sheets.apiUrl;
    config.sheets.apiUrl = 'http://127.0.0.1:1/exec';
    try {
      await expect(sheetCollection.find('Users', {})).rejects.toMatchObject({ statusCode: 503 });
    } finally {
      config.sheets.apiUrl = original;
    }
  });

  it('runs the student-to-student chat flow through the sheet', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Peer One', username: 'peerone', password: 'peerone1', status: 'active' });
    await User.create({ name: 'Peer Two', username: 'peertwo', password: 'peertwo1', status: 'active' });
    const one = request.agent(app);
    const two = request.agent(app);
    await one.post('/api/v1/auth/login').send({ identifier: 'peerone', password: 'peerone1' });
    await two.post('/api/v1/auth/login').send({ identifier: 'peertwo', password: 'peertwo1' });

    const dir = await one.get('/api/v1/messages/directory?q=peer');
    const other = dir.body.data.users.find((u) => u.username === 'peertwo');
    expect(other).toBeTruthy();
    expect(dir.body.data.users.some((u) => u.username === 'peerone')).toBe(false);

    const started = await one.post('/api/v1/messages/start').send({ userId: other._id });
    expect(started.status).toBe(201);
    const id = started.body.data.conversation._id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(started.body.data.conversation.peer.username).toBe('peertwo');

    await one.post(`/api/v1/messages/${id}`).send({ body: 'sheet hey' });
    const inbox = await two.get('/api/v1/messages');
    expect(inbox.body.data.conversations[0]).toMatchObject({ lastMessage: 'sheet hey', unread: 1 });

    const thread = await two.get(`/api/v1/messages/${id}`);
    expect(thread.body.data.messages.map((m) => m.body)).toEqual(['sheet hey']);
    expect(thread.body.data.messages[0].mine).toBe(false);
    expect((await two.get('/api/v1/messages/unread')).body.data.unread).toBe(0);
  });

  it('runs the group chat flow through the sheet', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Group One', username: 'groupone', password: 'groupone1', status: 'active' });
    await User.create({ name: 'Group Two', username: 'grouptwo', password: 'grouptwo1', status: 'active' });
    const one = request.agent(app);
    const two = request.agent(app);
    await one.post('/api/v1/auth/login').send({ identifier: 'groupone', password: 'groupone1' });
    await two.post('/api/v1/auth/login').send({ identifier: 'grouptwo', password: 'grouptwo1' });

    const dir = await one.get('/api/v1/messages/directory?q=grouptwo');
    const twoId = dir.body.data.users.find((u) => u.username === 'grouptwo')._id;

    const created = await one.post('/api/v1/groups').send({ name: 'Sheet squad', memberIds: [twoId] });
    expect(created.status).toBe(201);
    expect(created.body.data.group.memberCount).toBe(2);
    const id = created.body.data.group._id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    // The membership list round-trips through the sheet's JSON column.
    expect((await two.get('/api/v1/groups')).body.data.groups.map((g) => g._id)).toContain(id);
    expect((await two.get(`/api/v1/groups/${id}`)).body.data.group.members.map((m) => m.username)).toEqual(
      expect.arrayContaining(['groupone', 'grouptwo']),
    );

    await two.post(`/api/v1/groups/${id}/messages`).send({ body: 'sheet group hey' });
    const thread = await one.get(`/api/v1/groups/${id}`);
    expect(thread.body.data.messages.map((m) => m.body)).toEqual(['sheet group hey']);
    const list = await one.get('/api/v1/groups');
    expect(list.body.data.groups.find((g) => g._id === id).lastMessage).toBe('sheet group hey');
  });
});
