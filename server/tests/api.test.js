import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.ROSTER_CSV = 'AD.NO,REG. NO,NAME,PHONE,EMAIL\n3411,250001,New Student,,\n3412,250002,Second Student,,\n9999,250009,Lock User,,\n';
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
  it('creates an account for a student on the roster from just the registration number', async () => {
    const agent = request.agent(app);
    const ok = await agent.post('/api/v1/auth/signup').send({ regNo: '250001' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.user.username).toBe('new.student');
    expect(ok.body.data.user.name).toBe('New Student');
    expect(ok.body.data.user.role).toBe('user');
    expect(ok.body.data.user).not.toHaveProperty('password');
    expect(ok.headers['set-cookie'][0]).toMatch(/HttpOnly/);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data.user.username).toBe('new.student');

    // The registration + admission number is the initial password.
    expect((await login('new.student', '2500013411')).res.status).toBe(200);

    // A repeated signup for the same registration number does not collide: the
    // username is suffixed so the second student sharing a name can register.
    const again = await request(app).post('/api/v1/auth/signup').send({ regNo: '250001' });
    expect(again.status).toBe(201);
    expect(again.body.data.user.username).toBe('new.student.2');
  });

  it('rejects a registration number that is not on the roster', async () => {
    const badReg = await request(app).post('/api/v1/auth/signup').send({ regNo: '1234' });
    expect(badReg.status).toBe(403);
    expect((await request(app).post('/api/v1/auth/signup').send({})).status).toBe(400);
  });

  it('uses a password chosen at signup when one is supplied', async () => {
    const ok = await request(app)
      .post('/api/v1/auth/signup')
      .send({ regNo: '250002', password: 'chosen-pass-123' });
    expect(ok.status).toBe(201);
    expect((await login('second.student', 'chosen-pass-123')).res.status).toBe(200);
    expect((await login('second.student', '2500023412')).res.status).toBe(401);

    const short = await request(app).post('/api/v1/auth/signup').send({ regNo: '250002', password: 'short' });
    expect(short.status).toBe(400);
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
  it('lets either participant delete a direct conversation', async () => {
    const { User } = await import('../models/User.js');
    const { PeerConversation, PeerMessage } = await import('../models/PeerChat.js');
    await User.create({ name: 'Del One', username: 'delone', password: 'delone1' });
    await User.create({ name: 'Del Two', username: 'deltwo', password: 'deltwo1' });
    const { agent: one } = await login('delone', 'delone1');
    const { agent: two } = await login('deltwo', 'deltwo1');

    const dir = await one.get('/api/v1/messages/directory?q=deltwo');
    const other = dir.body.data.users.find((u) => u.username === 'deltwo');
    const id = (await one.post('/api/v1/messages/start').send({ userId: other._id })).body.data.conversation._id;
    await one.post(`/api/v1/messages/${id}`).send({ body: 'hello' });

    // A third student cannot delete a thread they are not part of.
    await User.create({ name: 'Del Nosy', username: 'delnosy', password: 'delnosy1' });
    const { agent: nosy } = await login('delnosy', 'delnosy1');
    expect((await nosy.delete(`/api/v1/messages/${id}`)).status).toBe(404);

    expect((await two.delete(`/api/v1/messages/${id}`)).status).toBe(204);
    expect((await one.get(`/api/v1/messages/${id}`)).status).toBe(404);
    expect(await PeerConversation.countDocuments({ _id: id })).toBe(0);
    expect(await PeerMessage.countDocuments({ conversation: id })).toBe(0);
  });
});

describe('groups', () => {
  it('requires a login to list or create groups', async () => {
    expect((await request(app).get('/api/v1/groups')).status).toBe(401);
    expect((await request(app).post('/api/v1/groups').send({ name: 'x' })).status).toBe(401);
  });

  it('creates a group with members and exchanges messages without an admin', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Group One', username: 'groupone', password: 'groupone1' });
    await User.create({ name: 'Group Two', username: 'grouptwo', password: 'grouptwo1' });
    await User.create({ name: 'Group Three', username: 'groupthree', password: 'groupthree1' });
    const { agent: one } = await login('groupone', 'groupone1');
    const { agent: two } = await login('grouptwo', 'grouptwo1');

    const meId = (await one.get('/api/v1/auth/me')).body.data.user._id;
    const dir = await one.get('/api/v1/messages/directory?q=grouptwo');
    const twoId = dir.body.data.users.find((u) => u.username === 'grouptwo')._id;

    // The creator is always included even when only another id is sent.
    const created = await one.post('/api/v1/groups').send({ name: 'Study buddies', memberIds: [twoId] });
    expect(created.status).toBe(201);
    expect(created.body.data.group.name).toBe('Study buddies');
    expect(created.body.data.group.memberCount).toBe(2);
    expect(created.body.data.group.mine).toBe(true);
    const id = created.body.data.group._id;

    // Both members see it; a third student does not.
    expect((await one.get('/api/v1/groups')).body.data.groups.map((g) => g._id)).toContain(id);
    expect((await two.get('/api/v1/groups')).body.data.groups.map((g) => g._id)).toContain(id);
    await User.create({ name: 'Group Four', username: 'groupfour', password: 'groupfour1' });
    const { agent: four } = await login('groupfour', 'groupfour1');
    expect((await four.get('/api/v1/groups')).body.data.groups).toHaveLength(0);
    expect((await four.get(`/api/v1/groups/${id}`)).status).toBe(404);

    await two.post(`/api/v1/groups/${id}/messages`).send({ body: 'hi all' });
    const thread = await one.get(`/api/v1/groups/${id}`);
    expect(thread.body.data.messages.map((m) => m.body)).toEqual(['hi all']);
    expect(thread.body.data.messages[0].mine).toBe(false);
    expect((await one.get('/api/v1/groups')).body.data.groups[0].lastMessage).toBe('hi all');

    // Any member can add others.
    const dirThree = await two.get('/api/v1/messages/directory?q=groupthree');
    const threeId = dirThree.body.data.users.find((u) => u.username === 'groupthree')._id;
    expect((await two.post(`/api/v1/groups/${id}/members`).send({ memberIds: [threeId] })).status).toBe(200);
    expect((await one.get(`/api/v1/groups/${id}`)).body.data.group.memberCount).toBe(3);

    // A member can leave; a non-member cannot.
    expect((await four.delete(`/api/v1/groups/${id}/members/me`)).status).toBe(404);
    expect((await two.delete(`/api/v1/groups/${id}/members/me`)).status).toBe(204);
    expect((await two.get(`/api/v1/groups/${id}`)).status).toBe(404);
    expect((await one.get(`/api/v1/groups/${id}`)).body.data.group.memberCount).toBe(2);
    expect(meId).toBeTruthy();
  });

  it('lets the creator remove members and delete the group', async () => {
    const { User } = await import('../models/User.js');
    const { Group, GroupMessage } = await import('../models/GroupChat.js');
    await User.create({ name: 'Owner One', username: 'ownerone', password: 'ownerone1' });
    await User.create({ name: 'Guest Two', username: 'guesttwo', password: 'guesttwo1' });
    const { agent: owner } = await login('ownerone', 'ownerone1');
    const { agent: guest } = await login('guesttwo', 'guesttwo1');

    const dir = await owner.get('/api/v1/messages/directory?q=guesttwo');
    const guestId = dir.body.data.users.find((u) => u.username === 'guesttwo')._id;
    const created = await owner.post('/api/v1/groups').send({ name: 'Project team', memberIds: [guestId] });
    const id = created.body.data.group._id;
    const meId = (await owner.get('/api/v1/auth/me')).body.data.user._id;
    expect(created.body.data.group.createdBy).toBe(meId);

    // A plain member cannot remove anyone or delete the group.
    expect((await guest.delete(`/api/v1/groups/${id}/members/${meId}`)).status).toBe(403);
    expect((await guest.delete(`/api/v1/groups/${id}`)).status).toBe(403);

    // The creator can remove a member, who then loses access.
    expect((await owner.delete(`/api/v1/groups/${id}/members/${guestId}`)).status).toBe(200);
    expect((await guest.get(`/api/v1/groups/${id}`)).status).toBe(404);
    expect((await owner.get(`/api/v1/groups/${id}`)).body.data.group.memberCount).toBe(1);

    // The creator can delete the group and its history.
    await GroupMessage.create({ group: id, sender: meId, body: 'bye' });
    expect((await owner.delete(`/api/v1/groups/${id}`)).status).toBe(204);
    expect((await owner.get(`/api/v1/groups/${id}`)).status).toBe(404);
    expect(await Group.countDocuments({ _id: id })).toBe(0);
    expect(await GroupMessage.countDocuments({ group: id })).toBe(0);
  });

  it('drops group messages older than the retention window', async () => {
    const { Group, GroupMessage } = await import('../models/GroupChat.js');
    const { User } = await import('../models/User.js');
    const mongoose = (await import('mongoose')).default;
    await User.create({ name: 'G Ret', username: 'gret', password: 'gretpass1' });
    const { agent } = await login('gret', 'gretpass1');
    const id = (await agent.post('/api/v1/groups').send({ name: 'Old group' })).body.data.group._id;

    const meId = (await agent.get('/api/v1/auth/me')).body.data.user._id;
    await GroupMessage.create({ group: id, sender: meId, body: 'old group message' });
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await GroupMessage.collection.updateMany(
      { group: new mongoose.Types.ObjectId(id) },
      { $set: { createdAt: old } },
    );

    const thread = await agent.get(`/api/v1/groups/${id}`);
    expect(thread.body.data.messages).toHaveLength(0);
    expect(thread.body.data.group.lastMessage).toBe('');
    expect(await Group.countDocuments({})).toBeGreaterThan(0);
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

  it('accepts a realistic compressed story image and still caps oversized ones', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Story Size', username: 'storysize', password: 'storysize1' });
    const { agent } = await login('storysize', 'storysize1');

    // A 1080px JPEG data URL is routinely several hundred KB; the old 100kb body
    // limit rejected it with 413 before the route validator ever ran.
    const imageUrl = `data:image/jpeg;base64,${'A'.repeat(400_000)}`;
    const ok = await agent.post('/api/v1/stories').send({ imageUrl, caption: 'big one' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.story.caption).toBe('big one');

    // Above the 1.5 MB validator cap the request is rejected by the route, not
    // by the body limit (which must sit higher so this path is reachable).
    const tooBig = await agent.post('/api/v1/stories').send({ imageUrl: `data:image/jpeg;base64,${'A'.repeat(1_600_000)}` });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.message).toContain('That image is too large');
  });

  it('groups stories by author, tracks views and limits deletion to the owner', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Story One', username: 'storyone', password: 'storyone1' });
    await User.create({ name: 'Story Two', username: 'storytwo', password: 'storytwo1' });
    const { agent: one } = await login('storyone', 'storyone1');
    const { agent: two } = await login('storytwo', 'storytwo1');

    const created = await one.post('/api/v1/stories').send({ imageUrl: 'data:image/png;base64,AAAA', caption: 'sunset run' });
    expect(created.status).toBe(201);
    expect(created.body.data.story.caption).toBe('sunset run');
    const storyId = created.body.data.story._id;

    const feed = await two.get('/api/v1/stories');
    const group = feed.body.data.groups.find((g) => g.user.username === 'storyone');
    expect(group.stories).toHaveLength(1);
    expect(group.stories[0].caption).toBe('sunset run');
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

describe('admin', () => {
  beforeAll(async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Plain User', username: 'plainuser', password: 'plainpass1' });
  });

  it('is closed to guests and non-admins', async () => {
    expect((await request(app).get('/api/v1/admin/stats')).status).toBe(401);
    expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);
    const { agent: user } = await login('plainuser', 'plainpass1');
    expect((await user.get('/api/v1/admin/stats')).status).toBe(403);
    expect((await user.get('/api/v1/admin/users')).status).toBe(403);
    expect((await user.post('/api/v1/admin/users').send({ name: 'X', username: 'xxxx', password: 'password1' })).status).toBe(403);
  });

  it('reports dashboard counters', async () => {
    const { agent: admin } = await login('admin', 'adminpass1');
    const res = await admin.get('/api/v1/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ admins: 1 });
    expect(res.body.data.users).toBeGreaterThan(0);
  });

  it('lists, searches and filters users', async () => {
    const { agent: admin } = await login('admin', 'adminpass1');
    const all = await admin.get('/api/v1/admin/users?limit=100');
    expect(all.status).toBe(200);
    expect(all.body.data.users.some((u) => u.username === 'admin')).toBe(true);
    expect(all.body.data.users[0]).not.toHaveProperty('password');

    const searched = await admin.get('/api/v1/admin/users?q=plainuser');
    expect(searched.body.data.users.map((u) => u.username)).toEqual(['plainuser']);

    const adminsOnly = await admin.get('/api/v1/admin/users?role=admin');
    expect(adminsOnly.body.data.users.every((u) => u.role === 'admin')).toBe(true);
  });

  it('creates, updates, disables and deletes a user', async () => {
    const { agent: admin } = await login('admin', 'adminpass1');
    const created = await admin
      .post('/api/v1/admin/users')
      .send({ name: 'Managed User', username: 'managed', email: 'managed@x.dev', password: 'managed123' });
    expect(created.status).toBe(201);
    const id = created.body.data.user._id;
    expect(created.body.data.user).toMatchObject({ username: 'managed', role: 'user', status: 'active' });

    // A duplicate username is rejected.
    expect(
      (await admin.post('/api/v1/admin/users').send({ name: 'Dup', username: 'managed', password: 'managed123' })).status,
    ).toBe(409);

    const promoted = await admin.patch(`/api/v1/admin/users/${id}`).send({ role: 'admin', status: 'disabled' });
    expect(promoted.body.data.user).toMatchObject({ role: 'admin', status: 'disabled' });

    // The admin cannot demote or disable themselves.
    const meId = (await admin.get('/api/v1/auth/me')).body.data.user._id;
    expect((await admin.patch(`/api/v1/admin/users/${meId}`).send({ role: 'user' })).status).toBe(400);
    expect((await admin.patch(`/api/v1/admin/users/${meId}`).send({ status: 'disabled' })).status).toBe(400);

    // Deleting removes the account and the content it owned.
    const { Post } = await import('../models/Post.js');
    await Post.create({ author: id, body: 'will be deleted' });
    expect((await admin.delete(`/api/v1/admin/users/${id}`)).status).toBe(204);
    expect(await Post.countDocuments({ author: id })).toBe(0);
    expect((await admin.get('/api/v1/admin/users?q=managed')).body.data.users).toHaveLength(0);
    expect((await admin.delete(`/api/v1/admin/users/${meId}`)).status).toBe(400);
  });
});

describe('reports and moderation', () => {
  it('requires a login to report and rejects reporting yourself', async () => {
    const { agent: user } = await login('plainuser', 'plainpass1');
    const meId = (await user.get('/api/v1/auth/me')).body.data.user._id;
    expect((await request(app).post('/api/v1/reports').send({ kind: 'user', targetId: meId })).status).toBe(401);
    expect((await user.post('/api/v1/reports').send({ kind: 'user', targetId: meId })).status).toBe(400);
  });

  it('lets a student report a thought and an admin resolve it by removing the content', async () => {
    const { agent: author } = await login('newbie', 'newpassword1');
    const post = (await author.post('/api/v1/posts').send({ body: 'reportable thought' })).body.data.post;

    const { agent: reporter } = await login('plainuser', 'plainpass1');
    const created = await reporter.post('/api/v1/reports').send({ kind: 'post', targetId: post._id, reason: 'spam', details: 'noise' });
    expect(created.status).toBe(201);
    expect(created.body.data.report).toMatchObject({ kind: 'post', reason: 'spam', status: 'open' });
    const reportId = created.body.data.report._id;

    // The same reporter cannot file the same report twice while it is open.
    expect((await reporter.post('/api/v1/reports').send({ kind: 'post', targetId: post._id })).status).toBe(409);

    // Non-admins cannot read the queue.
    expect((await reporter.get('/api/v1/admin/reports')).status).toBe(403);

    const { agent: admin } = await login('admin', 'adminpass1');
    const queue = await admin.get('/api/v1/admin/reports');
    expect(queue.body.data.reports.map((r) => r._id)).toContain(reportId);

    const resolved = await admin.patch(`/api/v1/admin/reports/${reportId}`).send({ action: 'resolve', removeContent: true });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.report.status).toBe('resolved');

    const { Post } = await import('../models/Post.js');
    expect(await Post.countDocuments({ _id: post._id })).toBe(0);
    expect((await admin.patch(`/api/v1/admin/reports/${reportId}`).send({ action: 'resolve' })).status).toBe(400);
  });

  it('lets a student report a person and a story', async () => {
    const { User } = await import('../models/User.js');
    await User.create({ name: 'Report Target', username: 'reporttarget', password: 'targetpass1' });
    const { agent: reporter } = await login('plainuser', 'plainpass1');
    const { agent: author } = await login('reporttarget', 'targetpass1');

    const profile = await request(app).get('/api/v1/auth/users/reporttarget');
    const targetId = profile.body.data.user._id;
    const person = await reporter.post('/api/v1/reports').send({ kind: 'user', targetId, reason: 'harassment' });
    expect(person.status).toBe(201);
    expect(person.body.data.report.targetLabel).toContain('reporttarget');

    const story = (await author.post('/api/v1/stories').send({ imageUrl: 'data:image/png;base64,AAAA', caption: 'spammy' })).body.data.story;
    const storyReport = await reporter.post('/api/v1/reports').send({ kind: 'story', targetId: story._id, reason: 'nudity' });
    expect(storyReport.status).toBe(201);
    expect(storyReport.body.data.report.targetLabel).toContain('spammy');
  });

  it('suspends a user for a time and dismisses them, then reinstates', async () => {
    const { User } = await import('../models/User.js');
    const target = await User.create({ name: 'Suspend Me', username: 'suspendme', password: 'suspendpass1' });
    const { agent: admin } = await login('admin', 'adminpass1');

    // Suspension needs a future end time.
    expect((await admin.patch(`/api/v1/admin/users/${target._id}`).send({ action: 'suspend' })).status).toBe(400);

    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const suspended = await admin.patch(`/api/v1/admin/users/${target._id}`).send({ action: 'suspend', suspendUntil: until });
    expect(suspended.body.data.user).toMatchObject({ status: 'disabled', suspension: 'suspended' });

    // A suspended account cannot log in, and the block says when it ends.
    const blocked = await login('suspendme', 'suspendpass1');
    expect(blocked.res.status).toBe(403);
    expect(blocked.res.body.message).toMatch(/suspended until/i);

    const dismissed = await admin.patch(`/api/v1/admin/users/${target._id}`).send({ action: 'dismiss' });
    expect(dismissed.body.data.user).toMatchObject({ status: 'disabled', suspension: 'dismissed' });
    expect((await login('suspendme', 'suspendpass1')).res.body.message).toMatch(/disabled/i);

    const back = await admin.patch(`/api/v1/admin/users/${target._id}`).send({ action: 'reinstate' });
    expect(back.body.data.user).toMatchObject({ status: 'active', suspension: 'active' });
    expect((await login('suspendme', 'suspendpass1')).res.status).toBe(200);
  });

  it('counts open reports in the dashboard stats', async () => {
    const { agent: admin } = await login('admin', 'adminpass1');
    const stats = await admin.get('/api/v1/admin/stats');
    expect(stats.body.data.openReports).toBeGreaterThanOrEqual(0);
    expect(stats.body.data).toHaveProperty('suspended');
  });

  it('lets an admin list, search, hide and delete thoughts', async () => {
    const { agent: author } = await login('newbie', 'newpassword1');
    const thought = (await author.post('/api/v1/posts').send({ body: 'a very searchable thought' })).body.data.post;

    // Only admins can reach the moderation list.
    expect((await author.get('/api/v1/admin/posts')).status).toBe(403);

    const { agent: admin } = await login('admin', 'adminpass1');
    const all = await admin.get('/api/v1/admin/posts?limit=100');
    expect(all.status).toBe(200);
    expect(all.body.data.posts.some((p) => p._id === thought._id)).toBe(true);

    // Search matches the body and the author's username.
    const byBody = await admin.get('/api/v1/admin/posts?q=searchable');
    expect(byBody.body.data.posts.map((p) => p._id)).toContain(thought._id);
    const byAuthor = await admin.get('/api/v1/admin/posts?q=newbie');
    expect(byAuthor.body.data.posts.map((p) => p._id)).toContain(thought._id);

    // Hide, then confirm it is filtered out of the visible set.
    const hidden = await admin.patch(`/api/v1/posts/${thought._id}`).send({ hidden: true });
    expect(hidden.body.data.post.hidden).toBe(true);
    const visible = await admin.get('/api/v1/admin/posts?hidden=false&limit=100');
    expect(visible.body.data.posts.map((p) => p._id)).not.toContain(thought._id);

    // Delete removes it outright.
    expect((await admin.delete(`/api/v1/posts/${thought._id}`)).status).toBe(204);
    const { Post } = await import('../models/Post.js');
    expect(await Post.countDocuments({ _id: thought._id })).toBe(0);
  });

  it('exposes the account behind a reported thought so an admin can act on it', async () => {
    const { agent: author } = await login('newbie', 'newpassword1');
    const post = (await author.post('/api/v1/posts').send({ body: 'owns this thought' })).body.data.post;
    const { agent: reporter } = await login('plainuser', 'plainpass1');
    const report = (await reporter.post('/api/v1/reports').send({ kind: 'post', targetId: post._id, reason: 'spam' })).body.data.report;

    const { agent: admin } = await login('admin', 'adminpass1');
    const queue = await admin.get('/api/v1/admin/reports?status=open&limit=100');
    const row = queue.body.data.reports.find((r) => r._id === report._id);
    expect(row.targetAuthor).toMatchObject({ username: 'newbie' });

    await admin.delete(`/api/v1/posts/${post._id}`);
    await admin.patch(`/api/v1/admin/reports/${report._id}`).send({ action: 'dismiss' });
  });
});
