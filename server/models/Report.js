import mongoose from 'mongoose';
import { datastore } from '../config.js';
import { SheetsReport } from '../sheets/models.js';
import { SupabaseReport } from '../supabase/models.js';

// A report is a student flagging a thought, a story or another person. Admins
// triage the queue: they can hide/remove the reported content and suspend the
// account behind it. `kind` is one of post, story or user; `targetId` is the id
// of the reported row, and the denormalised `targetLabel` keeps the queue
// readable even after the content is gone.

export const REPORT_KINDS = ['post', 'story', 'user'];
export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'nudity', 'misinformation', 'other'];

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reporterName: { type: String, default: '' },
    kind: { type: String, enum: REPORT_KINDS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetLabel: { type: String, default: '', maxlength: 300 },
    reason: { type: String, enum: REPORT_REASONS, default: 'other' },
    details: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: Date,
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ kind: 1, targetId: 1 });

const MongoReport = mongoose.models.Report || mongoose.model('Report', reportSchema);

const active = datastore();
export const Report = active === 'supabase' ? SupabaseReport : active === 'sheets' ? SheetsReport : MongoReport;
