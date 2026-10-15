import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs the whole API against a real Postgres. The schema in
// supabase/migrations/0001_init.sql is applied first. Point TEST_DATABASE_URL at
// a throwaway database; without it the suite is skipped.
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/dhgram npm test
//
process.env.NODE_ENV = 'test';
process.env.ROSTER_CSV = 'AD.NO,REG. NO,NAME,PHONE,EMAIL\n3411,250001,New Student,,\n3412,250002,Chat Student,,\n3413,250003,Drift Student,,\n';

const DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;

let app;
let db;
let closePool;

const TABLES = ['app_games', 'app_reports', 'app_peer_messages', 'app_peer_conversations', 'app_messages', 'app_conversations', 'app_otps', 'app_posts', 'app_users'];

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

  it('provisions an account on first login, then reads /me', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/login').send({ identifier: 'new.student', password: '2500013411' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.username).toBe('new.student');
    expect(login.body.data.user.role).toBe('user');
    expect(login.body.data.user).not.toHaveProperty('password');

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data.user.username).toBe('new.student');

    const again = await request(app).post('/api/v1/auth/login').send({ identifier: 'new.student', password: '2500013411' });
    expect(again.status).toBe(200);

    const bad = await request(app).post('/api/v1/auth/login').send({ identifier: 'new.student', password: 'wrongpass' });
    expect(bad.status).toBe(401);
  });

  it('lets a student log in with their registration number instead of username', async () => {
    const byReg = await request(app).post('/api/v1/auth/login').send({ identifier: '250001', password: '2500013411' });
    expect(byReg.status).toBe(200);
    expect(byReg.body.data.user.username).toBe('new.student');
    expect(byReg.body.data.user.regNo).toBe('250001');
  });

  it('rejects a username that is not on the roster', async () => {
    expect((await request(app).post('/api/v1/auth/login').send({ identifier: 'ghost.user', password: '2500013411' })).status).toBe(401);
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
    await user.post('/api/v1/auth/login').send({ identifier: 'chat.student', password: '2500023412' });

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

  it('keeps login working when the database lags the code (missing reg_no column)', async () => {
    // A deployed database can miss a migration the code already assumes. Dropping
    // app_users.reg_no reproduces the old 500 on every non-email login and checks
    // that the write path drops unknown columns instead of failing the request.
    await db().query('alter table app_users drop column if exists reg_no');
    try {
      // An unknown identifier returns 401, not a 500.
      const unknown = await request(app).post('/api/v1/auth/login').send({ identifier: 'ghost.user', password: 'whatever1' });
      expect(unknown.status).toBe(401);

      // A roster student is still provisioned on first login by registration number.
      const first = await request(app).post('/api/v1/auth/login').send({ identifier: '250003', password: '2500033413' });
      expect(first.status).toBe(200);
      expect(first.body.data.user.username).toBe('drift.student');
      expect(first.body.data.user.regNo).toBeNull();
      const id = first.body.data.user._id;

      // The derived username keeps working afterwards.
      const byName = await request(app).post('/api/v1/auth/login').send({ identifier: 'drift.student', password: '2500033413' });
      expect(byName.status).toBe(200);

      // And the registration number resolves to the same account (no duplicate).
      const byReg = await request(app).post('/api/v1/auth/login').send({ identifier: '250003', password: '2500033413' });
      expect(byReg.status).toBe(200);
      expect(byReg.body.data.user._id).toBe(id);
    } finally {
      await db().query('alter table app_users add column if not exists reg_no text');
    }
  });

  it('runs a chess game on Postgres, storing the move list in a text[]', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Board One', username: 'boardone', password: 'boardone1', status: 'active' });
    await User.create({ name: 'Board Two', username: 'boardtwo', password: 'boardtwo1', status: 'active' });
    const one = request.agent(app);
    const two = request.agent(app);
    await one.post('/api/v1/auth/login').send({ identifier: 'boardone', password: 'boardone1' });
    await two.post('/api/v1/auth/login').send({ identifier: 'boardtwo', password: 'boardtwo1' });

    const dir = await one.get('/api/v1/messages/directory?q=boardtwo');
    const twoId = dir.body.data.users.find((u) => u.username === 'boardtwo')._id;

    const invite = await one.post('/api/v1/chess/invite').send({ userId: twoId, color: 'white' });
    expect(invite.status).toBe(201);
    const id = invite.body.data.game._id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await two.get('/api/v1/chess/invites')).body.data.invites.map((i) => i._id)).toContain(id);

    await two.post(`/api/v1/chess/${id}/accept`);
    expect((await two.post(`/api/v1/chess/${id}/move`).send({ from: 'e7', to: 'e5' })).status).toBe(400);
    await one.post(`/api/v1/chess/${id}/move`).send({ from: 'e2', to: 'e4' });
    await two.post(`/api/v1/chess/${id}/move`).send({ from: 'e7', to: 'e5' });

    const game = (await one.get(`/api/v1/chess/${id}`)).body.data.game;
    // The SAN list round-trips through the text[] column.
    expect(game.moves).toEqual(['e4', 'e5']);
    expect(game.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect((await one.get('/api/v1/chess')).body.data.games.map((g) => g._id)).toContain(id);

    const resigned = await two.post(`/api/v1/chess/${id}/resign`);
    expect(resigned.body.data.game).toMatchObject({ status: 'finished', result: 'w', resultReason: 'resignation' });
  });

  it('degrades gracefully when a feature table is missing (unapplied migration)', async () => {
    // A deployed database can be missing a whole table (a new feature's migration
    // was never applied). Dropping app_games reproduces the 500 the login page
    // showed for the chess page: "Something went wrong. Please try again later."
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Drift Board', username: 'driftboard', password: 'driftboard1', status: 'active' });
    const target = await User.create({ name: 'Drift Target', username: 'drifttarget', password: 'drifttarget1', status: 'active' });
    const one = request.agent(app);
    await one.post('/api/v1/auth/login').send({ identifier: 'driftboard', password: 'driftboard1' });

    await db().query('drop table if exists app_games cascade');
    try {
      // Reads answer empty rather than 500ing the page.
      expect((await one.get('/api/v1/chess')).status).toBe(200);
      expect((await one.get('/api/v1/chess')).body.data.games).toEqual([]);
      expect((await one.get('/api/v1/chess/invites')).status).toBe(200);
      expect((await one.get('/api/v1/chess/invites')).body.data.invites).toEqual([]);

      // A write fails with a clear operational message, not an opaque 500.
      const invite = await one.post('/api/v1/chess/invite').send({ userId: String(target._id), color: 'white' });
      expect(invite.status).toBe(503);
      expect(invite.body.message).toMatch(/unavailable/i);
    } finally {
      await db().query('drop table if exists app_games cascade');
      await db().query(`
        create table app_games (
          id uuid primary key default gen_random_uuid(),
          white_id uuid not null references app_users (id) on delete cascade,
          black_id uuid not null references app_users (id) on delete cascade,
          invited_by uuid not null references app_users (id) on delete cascade,
          status text not null default 'pending' check (status in ('pending', 'active', 'finished')),
          result text check (result in ('w', 'b', 'draw')),
          result_reason text,
          moves text[] not null default '{}',
          fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          draw_offered_by uuid references app_users (id) on delete set null,
          accepted_at timestamptz,
          finished_at timestamptz,
          last_move_at timestamptz not null default now(),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
    }

    // Once the migration is applied, the same warm process works again: the
    // schema cache must not have latched onto the empty (missing-table) state.
    const after = await one.post('/api/v1/chess/invite').send({ userId: String(target._id), color: 'white' });
    expect(after.status).toBe(201);
  });
});
