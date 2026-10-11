import mongoose from 'mongoose';
import { datastore } from '../config.js';
import { SheetsStory, SheetsStoryView } from '../sheets/models.js';
import { SupabaseStory, SupabaseStoryView } from '../supabase/models.js';

// Instagram-style stories: an image that is visible for 24 hours. Views are
// tracked in a separate collection so the author can see who watched, and so a
// story row stays immutable.

const storySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrl: { type: String, required: true },
  },
  { timestamps: true },
);
storySchema.index({ author: 1, createdAt: -1 });
storySchema.index({ createdAt: -1 });

const storyViewSchema = new mongoose.Schema(
  {
    story: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
storyViewSchema.index({ story: 1, viewer: 1 }, { unique: true });

const MongoStory = mongoose.models.Story || mongoose.model('Story', storySchema);
const MongoStoryView = mongoose.models.StoryView || mongoose.model('StoryView', storyViewSchema);

const active = datastore();
export const Story = active === 'supabase' ? SupabaseStory : active === 'sheets' ? SheetsStory : MongoStory;
export const StoryView =
  active === 'supabase' ? SupabaseStoryView : active === 'sheets' ? SheetsStoryView : MongoStoryView;
