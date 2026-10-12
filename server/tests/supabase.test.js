import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs the whole API against a real Postgres. The schema in
// supabase/migrations/0001_init.sql is applied first. Point TEST_DATABASE_URL at
// a throwaway database; without it the suite is skipped.
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/dhgram npm test
//
process.env.NODE_ENV = 'test';
process.env.ROSTER_CSV = 'AD.NO,REG. NO,NAME,PHONE,EMAIL\n3411,250001,New Student,,\n3412,250002,Chat Student,,\n';

const DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;

let app;
let db;
let closePool;

const TABLES = ['app_peer_messages', 'app_peer_conversations', 'app_messages', 'app_conversations', 'app_otps', 'app_posts', 'app_users'];

beforeAll(async () => {
  if (!DB_URL) return;
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_DB_URL = DB_URL;

  // `pg` reads the connection string; tests need a clean slate.
  ({ getPool: db, closePool } = await import('../supabase/db.js'));
  await db().query('truncate ' + TABLES.join(', ') + ' restart identity cascade');

  const { createApp } = await import('../app.js');
  app = createApp({ connect: () => Promise.reject(new Error('MongoDB must not be used in supabase mode')) });
}, 60000);

afterAll(async () => {
  if (closePool) await closePool();
});

describeIfDb('DHGRAM on Supabase (Postgres)', () => {
  it('reports the supabase datastore', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.body.datastore).toBe('supabase');
  });

  it('creates an account from the roster, logs in and reads /me', async () => {
    const agent = request.agent(app);
    const ok = await agent.post('/api/v1/auth/signup').send({ name: 'New Student', regNo: '250001' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.user.username).toBe('new.student');
    expect(ok.body.data.user.role).toBe('user');
    expect(ok.body.data.user).not.toHaveProperty('password');

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data.user.username).toBe('new.student');

    const login = await request(app).post('/api/v1/auth/login').send({ identifier: 'new.student', password: '2500013411' });
    expect(login.status).toBe(200);

    const bad = await request(app).post('/api/v1/auth/login').send({ identifier: 'new.student', password: 'wrongpass' });
    expect(bad.status).toBe(401);
  });

  it('rejects a name or registration number that is not on the roster', async () => {
    expect((await request(app).post('/api/v1/auth/signup').send({ name: 'Nobody Here', regNo: '250001' })).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/signup').send({ name: 'New Student', regNo: '999999' })).status).toBe(403);
  });

  it('enforces the OTP resend cooldown and rejects a wrong code', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Otp', username: 'otpuser', email: 'otp@student.dev', password: 'password1' });
    await request(app).post('/api/v1/auth/password/request-otp').send({ email: 'otp@student.dev' });
    const again = await request(app).post('/api/v1/auth/password/request-otp').send({ email: 'otp@student.dev' });
    expect(again.status).toBe(429);

    const wrong = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ email: 'otp@student.dev', code: '000000', password: 'password1' });
    expect(wrong.status).toBe(400);
  });

  it('seeds an admin account used by the support chat flow', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Admin', username: 'admin', email: 'admin@test.dev', password: 'adminpass1', role: 'admin', emailVerified: true });

    const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/login').send({ identifier: 'admin', password: 'adminpass1' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('admin');
  });

  it('runs the chat flow', async () => {
    const user = request.agent(app);
    await user.post('/api/v1/auth/signup').send({ name: 'Chat Student', regNo: '250002' });

    const sent = await user.post('/api/v1/chat/me/messages').send({ body: 'Hello admin' });
    expect(sent.status).toBe(201);

    const mine = await user.get('/api/v1/chat/me');
    expect(mine.body.data.messages[0].body).toBe('Hello admin');
    expect(mine.body.data.conversation.unreadForAdmin).toBe(1);

    const unread = await user.get('/api/v1/chat/me/unread');
    expect(unread.body.data.unread).toBe(0);

    const admin = request.agent(app);
    await admin.post('/api/v1/auth/login').send({ identifier: 'admin', password: 'adminpass1' });
    const inbox = await admin.get('/api/v1/chat/conversations');
    expect(inbox.body.data.conversations).toHaveLength(1);
    expect(inbox.body.data.conversations[0].user.username).toBe('chat.student');

    const convoId = inbox.body.data.conversations[0]._id;
    const reply = await admin.post(`/api/v1/chat/conversations/${convoId}/messages`).send({ body: 'Hi there' });
    expect(reply.status).toBe(201);

    const thread = await user.get('/api/v1/chat/me');
    expect(thread.body.data.messages.map((m) => m.body)).toEqual(['Hello admin', 'Hi there']);
    expect(thread.body.data.conversation.unreadForUser).toBe(0);

    const closed = await admin.patch(`/api/v1/chat/conversations/${convoId}`).send({ status: 'closed' });
    expect(closed.body.data.conversation.status).toBe('closed');
  });

  it('drops chat messages older than the retention window', async () => {
    const { Message } = await import('../models/Chat.js');
    const user = request.agent(app);
    await user.post('/api/v1/auth/login').send({ identifier: 'chat.student', password: '2500023412' });
    await user.post('/api/v1/chat/me/messages').send({ body: 'soon to be purged' });
    const conv = (await user.get('/api/v1/chat/me')).body.data.conversation;
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await Message.updateMany({ conversation: conv._id }, { $set: { createdAt: old } });

    const thread = await user.get('/api/v1/chat/me');
    expect(thread.body.data.messages).toHaveLength(0);
    expect(thread.body.data.conversation.lastMessage).toBe('');
  });

  it('shares and moderates posts', async () => {
    const user = request.agent(app);
    await user.post('/api/v1/auth/login').send({ identifier: 'chat.student', password: '2500023412' });

    expect((await request(app).get('/api/v1/posts')).status).toBe(200);
    const created = await user.post('/api/v1/posts').send({ body: 'Hello from Postgres' });
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

    const admin = request.agent(app);
    await admin.post('/api/v1/auth/login').send({ identifier: 'admin', password: 'adminpass1' });
    const hidden = await admin.patch(`/api/v1/posts/${id}`).send({ hidden: true });
    expect(hidden.body.data.post.hidden).toBe(true);
    expect((await request(app).get('/api/v1/posts')).body.total).toBe(0);

    expect((await user.delete(`/api/v1/posts/${id}`)).status).toBe(204);
  });

  it('runs the student-to-student chat flow', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Peer One', username: 'peerone', password: 'peerone1', status: 'active' });
    await User.create({ name: 'Peer Two', username: 'peertwo', password: 'peertwo1', status: 'active' });
    const one = request.agent(app);
    const two = request.agent(app);
    await one.post('/api/v1/auth/login').send({ identifier: 'peerone', password: 'peerone1' });
    await two.post('/api/v1/auth/login').send({ identifier: 'peertwo', password: 'peertwo1' });

    const dir = await one.get('/api/v1/messages/directory?q=peer');
    expect(dir.status).toBe(200);
    const other = dir.body.data.users.find((u) => u.username === 'peertwo');
    expect(other).toBeTruthy();
    expect(dir.body.data.users.some((u) => u.username === 'peerone')).toBe(false);

    const started = await one.post('/api/v1/messages/start').send({ userId: other._id });
    expect(started.status).toBe(201);
    const id = started.body.data.conversation._id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(started.body.data.conversation.peer.username).toBe('peertwo');

    await one.post(`/api/v1/messages/${id}`).send({ body: 'pg hey' });
    const inbox = await two.get('/api/v1/messages');
    expect(inbox.body.data.conversations[0]).toMatchObject({ lastMessage: 'pg hey', unread: 1 });
    expect(inbox.body.data.conversations[0].peer.username).toBe('peerone');
    expect((await two.get('/api/v1/messages/unread')).body.data.unread).toBe(1);

    const thread = await two.get(`/api/v1/messages/${id}`);
    expect(thread.body.data.messages.map((m) => m.body)).toEqual(['pg hey']);
    expect(thread.body.data.messages[0].mine).toBe(false);
    expect((await two.get('/api/v1/messages/unread')).body.data.unread).toBe(0);

    // Starting the same chat again reuses the thread rather than duplicating it.
    await one.post('/api/v1/messages/start').send({ userId: other._id });
    expect((await one.get('/api/v1/messages')).body.data.conversations).toHaveLength(1);
  });
});
