import mongoose from 'mongoose';
import { datastore } from '../config.js';
import { SheetsGroup, SheetsGroupMember, SheetsGroupMessage } from '../sheets/models.js';
import { SupabaseGroup, SupabaseGroupMember, SupabaseGroupMessage } from '../supabase/models.js';

// Student group chats. Any member can create a group and add other students;
// there is no admin role in a group. Membership is a plain list of user ids so
// the same shape works on every datastore (a Mongo array, a JSON column in the
// Sheet, and a uuid[] column in Postgres).

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
groupSchema.index({ members: 1, lastMessageAt: -1 });

const groupMessageSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true },
);
groupMessageSchema.index({ group: 1, createdAt: 1 });

const MongoGroup = mongoose.models.Group || mongoose.model('Group', groupSchema);
const MongoGroupMessage = mongoose.models.GroupMessage || mongoose.model('GroupMessage', groupMessageSchema);

const active = datastore();
export const Group = active === 'supabase' ? SupabaseGroup : active === 'sheets' ? SheetsGroup : MongoGroup;
export const GroupMessage = active === 'supabase' ? SupabaseGroupMessage : active === 'sheets' ? SheetsGroupMessage : MongoGroupMessage;

// Membership is stored as a plain id array. Beside the canonical Group model the
// Supabase driver also exposes a join table, but the id array keeps reads to a
// single query and works identically on all three datastores.
export { SheetsGroupMember, SupabaseGroupMember };

const idOf = (value) => (value && typeof value === 'object' ? value._id : value);

export function memberIds(group) {
  return (group?.members ?? []).map((m) => String(idOf(m)));
}

export function isMember(group, userId) {
  return memberIds(group).includes(String(userId));
}

// Group membership is a list, and Mongo is the only driver that can match a bare
// value against an array field. The Sheet and Postgres (uuid[]) drivers return
// every group and filter in Node, which the group counts stay small enough for.
export async function findGroupsForUser(userId) {
  if (datastore() === 'mongo') return Group.find({ members: userId }).sort({ lastMessageAt: -1 }).limit(200).lean();
  const groups = await Group.find({}).lean();
  return groups.filter((g) => isMember(g, userId)).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}

