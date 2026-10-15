import mongoose from 'mongoose';
import { datastore } from '../config.js';
import { SheetsGame } from '../sheets/models.js';
import { SupabaseGame } from '../supabase/models.js';

// One-to-one chess games. A row starts as a `pending` invite from `invitedBy`;
// the opponent accepting flips it to `active`, declining deletes it. Moves are
// stored as a list of SAN strings and replayed with chess.js on the server, which
// is the only authority on legality — the client sends a move, the server checks
// it against the position before saving.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const gameSchema = new mongoose.Schema(
  {
    white: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    black: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'active', 'finished'], default: 'pending' },
    // 'w' | 'b' | 'draw' once the game is over, otherwise null.
    result: { type: String, enum: ['w', 'b', 'draw', null], default: null },
    resultReason: { type: String, default: null },
    moves: { type: [String], default: [] },
    fen: { type: String, default: START_FEN },
    // The side with an open draw offer; cleared on accept or decline.
    drawOfferedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: Date,
    finishedAt: Date,
    lastMoveAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
gameSchema.index({ white: 1, lastMoveAt: -1 });
gameSchema.index({ black: 1, lastMoveAt: -1 });
gameSchema.index({ status: 1, lastMoveAt: -1 });

const MongoGame = mongoose.models.Game || mongoose.model('Game', gameSchema);

const active = datastore();
export const Game = active === 'supabase' ? SupabaseGame : active === 'sheets' ? SheetsGame : MongoGame;

const idOf = (value) => (value && typeof value === 'object' ? value._id : value);

// The colour `userId` plays in this game, or null when they are not a player.
export function sideFor(game, userId) {
  const me = String(userId);
  if (String(idOf(game.white)) === me) return 'w';
  if (String(idOf(game.black)) === me) return 'b';
  return null;
}

export function isPlayer(game, userId) {
  return sideFor(game, userId) !== null;
}

export function opponentOf(game, userId) {
  return sideFor(game, userId) === 'w' ? game.black : game.white;
}
