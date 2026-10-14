import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { datastore } from '../config.js';
import { SheetsUser } from '../sheets/models.js';
import { SupabaseUser } from '../supabase/models.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 30 },
    // The roster registration number, kept so a student can sign in with either
    // their username or this number. Sparse: hand-made accounts (e.g. the admin)
    // have none. Not unique: the roster is the source of truth, not this cache.
    regNo: { type: String, lowercase: true, trim: true, sparse: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    // Spreadsheet signup sets this to the registration number followed by the
    // admission number, so the 8-character minimum of the old email flow is not
    // enforced here.
    password: { type: String, required: true, minlength: 1, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    // `status` stays a two-value switch for compatibility with every datastore.
    // A suspension is a `disabled` user with a future `suspendedUntil`; when that
    // time passes the account is lifted back to `active`. A permanent disable
    // (a "dismiss") is `disabled` with no `suspendedUntil`.
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    suspendedUntil: Date,
    avatar: { type: String, default: '' },
    emailVerified: { type: Boolean, default: false },
    passwordChangedAt: Date,
    lastLoginAt: Date,
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
});

userSchema.methods.checkPassword = function checkPassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.changedPasswordAfter = function changedPasswordAfter(jwtIat) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtIat;
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    _id: this._id,
    name: this.name,
    username: this.username,
    regNo: this.regNo ?? null,
    email: this.email ?? null,
    role: this.role,
    status: this.status,
    suspendedUntil: this.suspendedUntil ?? null,
    avatar: this.avatar ?? null,
    emailVerified: this.emailVerified,
    lastLoginAt: this.lastLoginAt ?? null,
    createdAt: this.createdAt,
  };
};

const MongoUser = mongoose.models.User || mongoose.model('User', userSchema);

// Users live in MongoDB by default, in the Google Sheet when SHEETS_API_URL is
// set, or in Supabase when SUPABASE_URL plus a secret key / SUPABASE_DB_URL are set.
export const User = datastore() === 'supabase' ? SupabaseUser : datastore() === 'sheets' ? SheetsUser : MongoUser;
