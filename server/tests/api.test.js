import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.ROSTER_CSV = 'AD.NO,NAME,PHONE,EMAIL\n3411,New Student,,\n9999,Lock User,,\n';
// This suite runs on the in-memory MongoDB. Blank the other datastore settings
// that .env may carry so tests never reach a hosted database. Empty strings are
// used deliberately: dotenv does not override keys that already exist.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_DB_URL = '';
process.env.SHEETS_API_URL = '';
process.env.SHEETS_API_TOKEN = '';

let mongod;
let app;
let User;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const { connectDB } = await import('../db.js');
  const uri = mongod.getUri('dhgram-test');
  await connectDB(uri);
  ({ User } = await import('../models/User.js'));
  const { createApp } = await import('../app.js');
  app = createApp({ connect: () => connectDB(uri) });
  await User.create({ name: 'Admin', username: 'admin', email: 'admin@test.dev', password: 'adminpass1', role: 'admin' });
}, 60000);

afterAll(async () => {
  const { disconnectDB } = await import('../db.js');
  await disconnectDB();
  await mongod?.stop();
});

const login = async (identifier, password) => {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ identifier, password });
  return { agent, res };
};

describe('auth', () => {
  it('creates an account for a student on the roster', async () => {
    const agent = request.agent(app);
    const ok = await agent.post('/api/v1/auth/signup').send({ name: 'New Student', admissionNo: '3411' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.user.username).toBe('new.student');
    expect(ok.body.data.user.role).toBe('user');
    expect(ok.body.data.user).not.toHaveProperty('password');
    expect(ok.headers['set-cookie'][0]).toMatch(/HttpOnly/);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data.user.username).toBe('new.student');

    // The admission number is the initial password.
    expect((await login('new.student', '3411')).res.status).toBe(200);

    // A second signup for the same student is rejected.
    expect((await request(app).post('/api/v1/auth/signup').send({ name: 'New Student', admissionNo: '3411' })).status).toBe(409);
  });

  it('rejects a name or admission number that is not on the roster', async () => {
    const badName = await request(app).post('/api/v1/auth/signup').send({ name: 'Nobody Here', admissionNo: '3411' });
    expect(badName.status).toBe(403);
    const badAdNo = await request(app).post('/api/v1/auth/signup').send({ name: 'New Student', admissionNo: '1234' });
    expect(badAdNo.status).toBe(403);
  });

  it('rejects bad credentials and locks after repeated failures', async () => {
    await User.create({ name: 'Lock', username: 'locky', password: 'password1' });
    for (let i = 0; i < 5; i++) {
      const { res } = await login('locky', 'wrongpass');
      expect(res.status).toBe(401);
    }
    const { res } = await login('locky', 'password1');
    expect(res.status).toBe(423);
  });

  it('resets password with OTP', async () => {
    await User.create({ name: 'New', username: 'newbie', email: 'new@student.dev', password: '3411' });
    const req1 = await request(app).post('/api/v1/auth/password/request-otp').send({ email: 'new@student.dev' });
    expect(req1.body.devCode).toMatch(/^\d{6}$/);
    const reset = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ email: 'new@student.dev', code: req1.body.devCode, password: 'newpassword1' });
    expect(reset.status).toBe(200);
    expect((await login('newbie', 'newpassword1')).res.status).toBe(200);

    const unknown = await request(app).post('/api/v1/auth/password/request-otp').send({ email: 'nobody@x.dev' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.devCode).toBeUndefined();
  });
});

describe('chat', () => {
  it('user messages admin and admin replies', async () => {
    expect((await request(app).get('/api/v1/chat/me')).status).toBe(401);
    const { agent: user } = await login('newbie', 'newpassword1');
    const sent = await user.post('/api/v1/chat/me/messages').send({ body: 'Hello admin' });
    expect(sent.status).toBe(201);
    expect((await user.get('/api/v1/chat/conversations')).status).toBe(403);

    const { agent: admin } = await login('admin', 'adminpass1');
    const convos = await admin.get('/api/v1/chat/conversations');
    expect(convos.body.data.conversations[0]).toMatchObject({ unreadForAdmin: 1, lastMessage: 'Hello admin' });
    const cid = convos.body.data.conversations[0]._id;
    await admin.get(`/api/v1/chat/conversations/${cid}/messages`);
    await admin.post(`/api/v1/chat/conversations/${cid}/messages`).send({ body: 'Hi! How can I help?' });

    expect((await user.get('/api/v1/chat/me/unread')).body.data.unread).toBe(1);
    const thread = await user.get('/api/v1/chat/me');
    expect(thread.body.data.messages.map((m) => m.senderRole)).toEqual(['user', 'admin']);
    expect((await user.get('/api/v1/chat/me/unread')).body.data.unread).toBe(0);
  });
});

describe('chat retention', () => {
  it('drops messages older than the retention window on read', async () => {
    const { Conversation, Message } = await import('../models/Chat.js');
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Retention', username: 'retention', password: 'password1' });
    const { agent: user } = await login('retention', 'password1');
    const me = (await user.get('/api/v1/auth/me')).body.data.user;
    const conv = await Conversation.create({ user: me._id });
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await Message.create({ conversation: conv._id, sender: me._id, senderRole: 'user', body: 'old message', createdAt: old });

    const thread = await user.get('/api/v1/chat/me');
    expect(thread.body.data.messages).toHaveLength(0);
    expect(thread.body.data.conversation.lastMessage).toBe('');
  });

  it('guards the cleanup endpoint with the cron secret', async () => {
    process.env.CRON_SECRET = '';
    expect((await request(app).get('/api/v1/chat/cron/cleanup')).status).toBe(503);
    process.env.CRON_SECRET = 'cron-secret-123';
    expect((await request(app).get('/api/v1/chat/cron/cleanup')).status).toBe(401);
    const ok = await request(app).get('/api/v1/chat/cron/cleanup').set('Authorization', 'Bearer cron-secret-123');
    expect(ok.status).toBe(200);
    expect(ok.body.data.retentionDays).toBe(30);
    process.env.CRON_SECRET = '';
  });
});

describe('posts', () => {
  it('requires a login to post but not to read', async () => {
    expect((await request(app).get('/api/v1/posts')).status).toBe(200);
    expect((await request(app).post('/api/v1/posts').send({ body: 'hi' })).status).toBe(401);
  });

  it('lets an account holder share, like, edit and delete a thought', async () => {
    const { agent: user } = await login('newbie', 'newpassword1');
    const created = await user.post('/api/v1/posts').send({ body: 'My first thought' });
    expect(created.status).toBe(201);
    const id = created.body.data.post._id;
    expect(created.body.data.post).toMatchObject({ body: 'My first thought', likes: 0, likedByMe: false, mine: true });
    expect(created.body.data.post.author).toMatchObject({ name: 'New', username: 'newbie' });

    const feed = await request(app).get('/api/v1/posts');
    expect(feed.body.total).toBe(1);
    expect(feed.body.data.posts[0].likedByMe).toBe(false);

    const liked = await user.post(`/api/v1/posts/${id}/like`);
    expect(liked.body.data.post).toMatchObject({ likes: 1, likedByMe: true });
    const unliked = await user.post(`/api/v1/posts/${id}/like`);
    expect(unliked.body.data.post).toMatchObject({ likes: 0, likedByMe: false });

    const edited = await user.patch(`/api/v1/posts/${id}`).send({ body: 'Edited thought' });
    expect(edited.body.data.post.body).toBe('Edited thought');

    const { User } = await import('../models/User.js');
    await User.create({ name: 'Other', username: 'other', password: 'otherpass1' });
    const { agent: other } = await login('other', 'otherpass1');
    expect((await other.patch(`/api/v1/posts/${id}`).send({ body: 'nope' })).status).toBe(403);

    expect((await user.delete(`/api/v1/posts/${id}`)).status).toBe(204);
    expect((await request(app).get('/api/v1/posts')).body.total).toBe(0);
  });

  it('hides a flagged post from the public feed for admins only', async () => {
    const { agent: user } = await login('newbie', 'newpassword1');
    const post = (await user.post('/api/v1/posts').send({ body: 'Hide me' })).body.data.post;

    const { agent: admin } = await login('admin', 'adminpass1');
    expect((await user.patch(`/api/v1/posts/${post._id}`).send({ hidden: true })).status).toBe(403);
    const hidden = await admin.patch(`/api/v1/posts/${post._id}`).send({ hidden: true });
    expect(hidden.body.data.post.hidden).toBe(true);

    expect((await request(app).get('/api/v1/posts')).body.total).toBe(0);
    expect((await admin.get('/api/v1/posts')).body.total).toBe(1);
    await admin.delete(`/api/v1/posts/${post._id}`);
  });
});


describe('peer messages', () => {
  it('requires a login and hides the directory from guests', async () => {
    expect((await request(app).get('/api/v1/messages')).status).toBe(401);
    expect((await request(app).get('/api/v1/messages/directory')).status).toBe(401);
  });

  it('lists students (minus self), starts a chat and exchanges messages', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Peer One', username: 'peerone', password: 'peerone1' });
    await User.create({ name: 'Peer Two', username: 'peertwo', password: 'peertwo1' });
    const { agent: one } = await login('peerone', 'peerone1');
    const { agent: two } = await login('peertwo', 'peertwo1');

    const dir = await one.get('/api/v1/messages/directory');
    expect(dir.status).toBe(200);
    expect(dir.body.data.users.some((u) => u.username === 'peerone')).toBe(false);
    const other = dir.body.data.users.find((u) => u.username === 'peertwo');
    expect(other).toBeTruthy();

    expect((await one.post('/api/v1/messages/start').send({ userId: other._id })).status).toBe(201);
    const meId = (await one.get('/api/v1/auth/me')).body.data.user._id;
    expect((await one.post('/api/v1/messages/start').send({ userId: meId })).status).toBe(400);

    // Starting twice returns the same thread.
    const again = await one.post('/api/v1/messages/start').send({ userId: other._id });
    expect((await one.get('/api/v1/messages')).body.data.conversations).toHaveLength(1);
    const id = again.body.data.conversation._id;

    await one.post(`/api/v1/messages/${id}`).send({ body: 'hey there' });
    const inbox = await two.get('/api/v1/messages');
    expect(inbox.body.data.conversations[0]).toMatchObject({ lastMessage: 'hey there', unread: 1 });
    expect(inbox.body.data.conversations[0].peer.username).toBe('peerone');
    expect((await two.get('/api/v1/messages/unread')).body.data.unread).toBe(1);

    const thread = await two.get(`/api/v1/messages/${id}`);
    expect(thread.body.data.messages.map((m) => m.body)).toEqual(['hey there']);
    expect(thread.body.data.messages[0].mine).toBe(false);

    await two.post(`/api/v1/messages/${id}`).send({ body: 'hi!' });
    const mine = await one.get(`/api/v1/messages/${id}`);
    expect(mine.body.data.messages.map((m) => m.body)).toEqual(['hey there', 'hi!']);
    expect(mine.body.data.messages[0].mine).toBe(true);

    // A third student cannot read someone else's thread.
    await User.create({ name: 'Nosy Parker', username: 'nosyparker', password: 'nosypass1' });
    const { agent: nosy } = await login('nosyparker', 'nosypass1');
    expect((await nosy.get(`/api/v1/messages/${id}`)).status).toBe(404);
    expect((await nosy.post(`/api/v1/messages/${id}`).send({ body: 'peek' })).status).toBe(404);
  });

  it('drops peer messages older than the retention window', async () => {
    const { PeerConversation, PeerMessage } = await import('../models/PeerChat.js');
    const { User } = await import('../models/User.js');
    const mongoose = (await import('mongoose')).default;
    // Fresh pair so the thread only holds the messages we plant here.
    await User.create({ name: 'Ret One', username: 'retone', password: 'retone1' });
    await User.create({ name: 'Ret Two', username: 'rettwo', password: 'rettwo1' });
    const { agent: one } = await login('retone', 'retone1');
    const dir = await one.get('/api/v1/messages/directory?q=rettwo');
    const other = dir.body.data.users.find((u) => u.username === 'rettwo');
    const id = (await one.post('/api/v1/messages/start').send({ userId: other._id })).body.data.conversation._id;

    const meId = (await one.get('/api/v1/auth/me')).body.data.user._id;
    await PeerMessage.create({ conversation: id, sender: meId, body: 'old peer message' });
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    // Mongoose's timestamps would reset createdAt on an update, so go through the
    // driver to age the row.
    await PeerMessage.collection.updateMany({ conversation: new mongoose.Types.ObjectId(id) }, { $set: { createdAt: old } });

    const thread = await one.get(`/api/v1/messages/${id}`);
    expect(thread.body.data.messages).toHaveLength(0);
    expect(thread.body.data.conversation.lastMessage).toBe('');
    expect(await PeerConversation.countDocuments({})).toBeGreaterThan(0);
  });
});

describe('security', () => {
  it('does not reflect arbitrary origins and hides stack details', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect((await request(app).get('/api/v1/nope')).status).toBe(404);
  });
});

describe('stories', () => {
  it('lets anyone read the feed but requires a login to post', async () => {
    expect((await request(app).get('/api/v1/stories')).status).toBe(200);
    expect((await request(app).post('/api/v1/stories').send({ imageUrl: 'data:image/png;base64,AAAA' })).status).toBe(401);
  });

  it('groups stories by author, tracks views and limits deletion to the owner', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Story One', username: 'storyone', password: 'storyone1' });
    await User.create({ name: 'Story Two', username: 'storytwo', password: 'storytwo1' });
    const { agent: one } = await login('storyone', 'storyone1');
    const { agent: two } = await login('storytwo', 'storytwo1');

    const created = await one.post('/api/v1/stories').send({ imageUrl: 'data:image/png;base64,AAAA' });
    expect(created.status).toBe(201);
    const storyId = created.body.data.story._id;

    const feed = await two.get('/api/v1/stories');
    const group = feed.body.data.groups.find((g) => g.user.username === 'storyone');
    expect(group.stories).toHaveLength(1);
    expect(group.unseen).toBe(true);

    // Viewing marks it seen for the viewer.
    expect((await two.post(`/api/v1/stories/${storyId}/view`)).status).toBe(200);
    const after = await two.get('/api/v1/stories');
    const seenGroup = after.body.data.groups.find((g) => g.user.username === 'storyone');
    expect(seenGroup.unseen).toBe(false);

    // Only the author can see who watched.
    expect((await two.get(`/api/v1/stories/${storyId}/viewers`)).status).toBe(403);
    const viewers = await one.get(`/api/v1/stories/${storyId}/viewers`);
    expect(viewers.body.data.viewers.map((v) => v.username)).toContain('storytwo');

    // Another student cannot delete the story.
    expect((await two.delete(`/api/v1/stories/${storyId}`)).status).toBe(403);
    expect((await one.delete(`/api/v1/stories/${storyId}`)).status).toBe(204);
    expect((await one.get('/api/v1/stories/mine')).body.data.stories).toHaveLength(0);
  });
});

describe('profile', () => {
  it('exposes a public profile and lets the owner set an avatar', async () => {
    const { agent } = await login('newbie', 'newpassword1');
    const publicView = await request(app).get('/api/v1/auth/users/newbie');
    expect(publicView.status).toBe(200);
    expect(publicView.body.data.user.username).toBe('newbie');
    expect(publicView.body.data.user).not.toHaveProperty('password');

    const avatar = 'data:image/jpeg;base64,/9j/AAAA';
    const updated = await agent.patch('/api/v1/auth/update-me').send({ avatar });
    expect(updated.status).toBe(200);
    expect(updated.body.data.user.avatar).toBe(avatar);
    expect((await request(app).get('/api/v1/auth/users/newbie')).body.data.user.avatar).toBe(avatar);

    expect((await request(app).get('/api/v1/auth/users/nobodyhere')).status).toBe(404);
  });

  it('filters the feed to a single author', async () => {
    const { agent } = await login('newbie', 'newpassword1');
    await agent.post('/api/v1/posts').send({ body: 'Author filtered thought' });
    const meId = (await agent.get('/api/v1/auth/me')).body.data.user._id;
    const mine = await request(app).get(`/api/v1/posts?author=${meId}`);
    expect(mine.body.total).toBeGreaterThan(0);
    expect(mine.body.data.posts.every((p) => p.author._id === meId)).toBe(true);
  });
});
