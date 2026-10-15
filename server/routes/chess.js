import { Chess } from 'chess.js';
import { Router } from 'express';
import { z } from 'zod';
import { protect } from '../middleware/auth.js';
import { chessLimiter } from '../middleware/rateLimit.js';
import { objectId, validate } from '../middleware/validate.js';
import { Game, START_FEN, isPlayer, sideFor } from '../models/Game.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

// One-to-one chess. A game is created as a `pending` invite; the opponent accepts
// (row goes `active`) or declines (row is deleted). Every move is checked against
// the position with chess.js on the server, so a client cannot send an illegal
// move and the stored FEN can always be trusted. The client polls GET /:id while
// a game is open, which is enough for a turn-based board.
const router = Router();
router.use(protect);

const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);

const shapeUser = (user) => {
  const u = user && typeof user === 'object' ? user : { _id: user };
  return { _id: u._id, name: u.name ?? '', username: u.username ?? '', avatar: u.avatar ?? null };
};

// Replay the SAN list from the start position. Any stored move was validated when
// it was played, so a throw here means the row was edited by hand.
function positionOf(moves) {
  const chess = new Chess();
  for (const san of Array.isArray(moves) ? moves : []) chess.move(san);
  return chess;
}

// What the game is worth to `me`: colour, whose turn it is, and the draw offer.
function shapeGame(game, me) {
  const g = plain(game);
  const chess = positionOf(g.moves);
  const myColor = sideFor(g, me);
  const drawBy = g.drawOfferedBy ? String(g.drawOfferedBy) : null;
  return {
    _id: g._id,
    status: g.status,
    result: g.result ?? null,
    resultReason: g.resultReason ?? null,
    moves: Array.isArray(g.moves) ? g.moves : [],
    fen: g.fen ?? START_FEN,
    myColor,
    turn: chess.turn(),
    myTurn: g.status === 'active' && myColor === chess.turn(),
    check: chess.isCheck(),
    gameOver: chess.isGameOver(),
    white: shapeUser(g.white),
    black: shapeUser(g.black),
    opponent: shapeUser(myColor === 'w' ? g.black : g.white),
    invitedByMe: Boolean(g.invitedBy && String(g.invitedBy) === String(me)),
    drawOfferByMe: Boolean(drawBy && String(me) === drawBy),
    drawOfferByOpponent: Boolean(drawBy && String(me) !== drawBy),
    createdAt: g.createdAt,
    acceptedAt: g.acceptedAt ?? null,
    finishedAt: g.finishedAt ?? null,
    lastMoveAt: g.lastMoveAt,
  };
}

async function loadGame(id, userId) {
  const game = await Game.findById(id);
  if (!game || !isPlayer(game, userId)) throw new AppError('Game not found', 404);
  return game;
}

// Close the game if the position is over. Called after every move so the result
// is recorded once, on the server, not inferred by the client.
function settle(game, chess) {
  if (!chess.isGameOver()) return false;
  game.status = 'finished';
  game.finishedAt = new Date();
  if (chess.isCheckmate()) {
    // The side to move is the one that has been mated.
    game.result = chess.turn() === 'w' ? 'b' : 'w';
    game.resultReason = 'checkmate';
  } else if (chess.isStalemate()) {
    game.result = 'draw';
    game.resultReason = 'stalemate';
  } else if (chess.isInsufficientMaterial()) {
    game.result = 'draw';
    game.resultReason = 'insufficient material';
  } else if (chess.isThreefoldRepetition()) {
    game.result = 'draw';
    game.resultReason = 'threefold repetition';
  } else {
    game.result = 'draw';
    game.resultReason = 'draw';
  }
  return true;
}

// A student can be invited only if they have an account (a roster row with no
// account has no id) and are active.
async function requireOpponent(userId, me) {
  if (String(userId) === String(me)) throw new AppError('You cannot invite yourself', 400);
  const other = await User.findById(userId);
  if (!other || other.status !== 'active') throw new AppError('That student is not available', 404);
  return other;
}

const INVITE_COLORS = ['white', 'black', 'random'];

// Send an invitation. The inviter picks a side (or leaves it to chance) and the
// opponent answers from Messages or the notification bell.
router.post(
  '/invite',
  validate(
    z.object({
      userId: objectId,
      color: z.enum(INVITE_COLORS).default('random'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    await requireOpponent(req.body.userId, me);

    // One open invitation per pair, in either direction, keeps the list calm.
    const pending = await Game.find({ status: 'pending' }).lean();
    const existing = pending.find(
      (g) => [String(g.white), String(g.black)].includes(me) && [String(g.white), String(g.black)].includes(String(req.body.userId)),
    );
    if (existing) throw new AppError('There is already an open invitation with this student', 409);

    const color = req.body.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : req.body.color;
    const game = await Game.create({
      white: color === 'white' ? me : req.body.userId,
      black: color === 'black' ? me : req.body.userId,
      invitedBy: me,
      status: 'pending',
      moves: [],
      fen: START_FEN,
      lastMoveAt: new Date(),
    });
    await game.populate('white', 'name username avatar');
    await game.populate('black', 'name username avatar');
    res.status(201).json({ status: 'success', data: { game: shapeGame(plain(game), me) } });
  }),
);

// Open invitations waiting on me.
router.get(
  '/invites',
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const games = await Game.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('white', 'name username avatar')
      .populate('black', 'name username avatar')
      .lean();
    const mine = games.filter((g) => String(g.invitedBy) !== me && [String(g.white?._id ?? g.white), String(g.black?._id ?? g.black)].includes(me));
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'success',
      data: {
        invites: mine.map((g) => {
          const whiteId = String(g.white?._id ?? g.white);
          return {
            _id: g._id,
            from: shapeUser(String(g.invitedBy) === whiteId ? g.white : g.black),
            createdAt: g.createdAt,
          };
        }),
      },
    });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const games = await Game.find({})
      .sort({ lastMoveAt: -1 })
      .limit(200)
      .populate('white', 'name username avatar')
      .populate('black', 'name username avatar')
      .lean();
    const mine = games.filter((g) => [String(g.white?._id ?? g.white), String(g.black?._id ?? g.black)].includes(me));
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { games: mine.map((g) => shapeGame(g, me)) } });
  }),
);

// Accept an invitation and open the board. Only the invited student may do this.
router.post(
  '/:id/accept',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const game = await loadGame(req.params.id, me);
    if (game.status !== 'pending') throw new AppError('That invitation is no longer open', 409);
    if (String(game.invitedBy) === me) throw new AppError('You sent this invitation', 400);
    game.status = 'active';
    game.acceptedAt = new Date();
    game.lastMoveAt = new Date();
    await game.save();
    res.json({ status: 'success', data: { game: shapeGame(plain(game), me) } });
  }),
);

// Decline an invitation. The row is removed rather than parked, so it cannot be
// accepted later and does not linger in either inbox.
router.post(
  '/:id/decline',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const game = await loadGame(req.params.id, me);
    if (game.status !== 'pending') throw new AppError('That invitation is no longer open', 409);
    if (String(game.invitedBy) === me) throw new AppError('You sent this invitation', 400);
    await game.deleteOne();
    res.status(204).end();
  }),
);

router.get(
  '/:id',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const game = await loadGame(req.params.id, me);
    await game.populate('white', 'name username avatar');
    await game.populate('black', 'name username avatar');
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { game: shapeGame(plain(game), me) } });
  }),
);

// Play a move. The body carries squares only; the SAN and the resulting FEN are
// derived here, so the stored game is always consistent with chess.js.
router.post(
  '/:id/move',
  chessLimiter,
  validate(z.object({ id: objectId }), 'params'),
  validate(
    z.object({
      from: z.string().trim().regex(/^[a-h][1-8]$/, 'Invalid square'),
      to: z.string().trim().regex(/^[a-h][1-8]$/, 'Invalid square'),
      promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const game = await loadGame(req.params.id, me);
    if (game.status === 'pending') throw new AppError('This game has not started yet', 409);
    if (game.status === 'finished') throw new AppError('This game is already over', 409);

    const chess = positionOf(game.moves);
    if (sideFor(game, me) !== chess.turn()) throw new AppError('It is not your turn', 400);

    let move;
    try {
      move = chess.move({ from: req.body.from, to: req.body.to, promotion: req.body.promotion });
    } catch {
      throw new AppError('That move is not legal', 400);
    }

    game.moves = [...(Array.isArray(game.moves) ? game.moves : []), move.san];
    game.fen = chess.fen();
    game.drawOfferedBy = null;
    game.lastMoveAt = new Date();
    settle(game, chess);
    await game.save();

    await game.populate('white', 'name username avatar');
    await game.populate('black', 'name username avatar');
    res.json({ status: 'success', data: { game: shapeGame(plain(game), me) } });
  }),
);

// Resign. The opponent wins; either player may resign a live game.
router.post(
  '/:id/resign',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const game = await loadGame(req.params.id, me);
    if (game.status !== 'active') throw new AppError('This game is not in progress', 409);
    game.status = 'finished';
    game.result = sideFor(game, me) === 'w' ? 'b' : 'w';
    game.resultReason = 'resignation';
    game.finishedAt = new Date();
    game.drawOfferedBy = null;
    await game.save();
    res.json({ status: 'success', data: { game: shapeGame(plain(game), me) } });
  }),
);

// Offer a draw, or accept the one already on the table. The opponent answers with
// the same endpoint; declining is a separate call.
router.post(
  '/:id/draw',
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ action: z.enum(['offer', 'accept', 'decline']).default('offer') })),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const game = await loadGame(req.params.id, me);
    if (game.status !== 'active') throw new AppError('This game is not in progress', 409);
    const offeredBy = game.drawOfferedBy ? String(game.drawOfferedBy) : null;

    if (req.body.action === 'offer') {
      game.drawOfferedBy = me;
    } else if (req.body.action === 'accept') {
      if (!offeredBy || offeredBy === me) throw new AppError('There is no draw to accept', 400);
      game.status = 'finished';
      game.result = 'draw';
      game.resultReason = 'agreement';
      game.finishedAt = new Date();
      game.drawOfferedBy = null;
    } else {
      if (!offeredBy || offeredBy === me) throw new AppError('There is no draw to decline', 400);
      game.drawOfferedBy = null;
    }
    await game.save();
    res.json({ status: 'success', data: { game: shapeGame(plain(game), me) } });
  }),
);

// Start a fresh game with the same opponent and colours. The finished game is
// left in place, so the list keeps its history.
router.post(
  '/:id/rematch',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const game = await loadGame(req.params.id, me);
    if (game.status !== 'finished') throw new AppError('Finish this game before a rematch', 409);
    const next = await Game.create({
      white: game.white,
      black: game.black,
      invitedBy: me,
      status: 'pending',
      moves: [],
      fen: START_FEN,
      lastMoveAt: new Date(),
    });
    await next.populate('white', 'name username avatar');
    await next.populate('black', 'name username avatar');
    res.status(201).json({ status: 'success', data: { game: shapeGame(plain(next), me) } });
  }),
);

export default router;
