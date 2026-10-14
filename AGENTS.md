# AGENTS.md

## Project

DHGRAM – "Share & Message". A chat + thought-sharing platform: a home page with
24-hour Stories and a public Thoughts feed, one-to-one and group student
Messages, profiles with avatars, and a Chat-with-Admin support thread that lives
inside Messages. React (Vite)
frontend + Express API. Frontend in `src/`, API in `server/`, Vercel serverless
entry in `api/index.js`.

## Commands

- `npm run dev` – API (:4000) + Vite (:5173) together
- `npm test` – vitest (spins up an in-memory MongoDB)
- `npm run lint` / `npm run typecheck` / `npm run build`
- `npm run seed:admin` – needs `ADMIN_USERNAME` and `ADMIN_PASSWORD`
- `npm run seed:students` – creates an account for every roster student (idempotent)
- `npm run supabase:apply` – apply every `supabase/migrations/*.sql` to `SUPABASE_DB_URL`

## Data layer

Three interchangeable datastores. One env var switches **everything** (users,
OTPs, chats, messages, posts) and the others are not touched. Precedence is
Supabase > Sheets > MongoDB, decided by `datastore()` in `server/config.js`.

- MongoDB (default): Mongoose models in `server/models/`.
- Google Sheets: set `SHEETS_API_URL` + `SHEETS_API_TOKEN`.
- Supabase (Postgres): set `SUPABASE_DB_URL`. Tables are prefixed `app_` so they
  never collide with Supabase's own schemas.

The Sheets and Supabase drivers both mimic the Mongoose surface the routes use
(`find`, `findOne`, `create`, `save`, `populate`, `aggregate`), so routes are
driver-agnostic and models just pick an implementation:

- `server/sheets/odm.js` + `server/sheets/models.js` — over an Apps Script Web App
  (`google-apps-script/Code.gs`). `SheetsQuery` is shared: the Supabase ODM
  reuses it for chainable `sort`/`skip`/`limit`/`lean`.
- `server/supabase/odm.js` + `server/supabase/models.js` — over `pg`. Filters are
  compiled to parameterised SQL in `server/supabase/sql.js`; the column maps in
  `models.js` translate camelCase fields to snake_case columns.

See `docs/google-sheets.md` and `docs/supabase.md`. Keep the spreadsheet
**private** (Share ▸ Restricted): the Apps Script runs as its owner and reads it,
and every request is gated by a constant-time `SHEETS_TOKEN` check. Password
hashes and OTP codes are in the sheet, so link-sharing it would leak them. The
Supabase migration enables RLS with no policies, so the publishable key can read
nothing; the backend connects directly as Postgres, which bypasses RLS.

## Conventions

- API responses: `{ status, data }`; errors via `AppError` (operational → its
  status code, otherwise a generic 500 with no internals leaked).
- IDs: Mongo ObjectIds under MongoDB; the Sheet and Supabase use UUIDs, so
  validators accept either (`objectId` in `server/middleware/validate.js`).
- Compare ids with `String(a) === String(b)`, never `a.equals(b)` — the Sheets
  and Supabase drivers return plain strings.
- The Sheets and Supabase ODMs apply schema defaults (`spec.defaults`) and must
  resolve `findOne`/`findById` to a single document, not an array.
- Postgres needs `returning *` **after** any `on conflict` clause.
- Tests live in `server/tests/`; `sheets.test.js` runs the full app against a
  local in-memory fake of the Apps Script protocol, with no MongoDB, and
  `supabase.test.js` runs it against a real Postgres via `TEST_DATABASE_URL`
  (skipped when unset).

## Messages (student-to-student DMs)

- `server/routes/messages.js` + `server/models/PeerChat.js`; the conversation is
  keyed by the unordered pair (`pairFor`) so both directions share one thread.
- `server/routes/chat.js` purges peer messages older than
  `config.chat.retentionDays` (30) whenever a thread is read.
- The `/messages` sidebar lists **all other active students** (from
  `/messages/directory`) on top of existing conversations; picking someone with
  no thread calls `/messages/start` and opens it.

## Group chats (multi-user)

- `server/routes/groups.js` + `server/models/GroupChat.js` back multi-user group
  messaging. A group is `app_groups` with a `members` array of user ids; messages
  live in `app_group_messages`. All routes require auth.
- `GET /groups` lists the caller's groups (last message + member preview),
  `POST /groups` creates one, `GET/POST /groups/:id/messages` read/send.
- Membership is checked with `memberIds`/`idOf` helpers so Mongo ObjectIds and
  Sheets/Supabase UUID strings compare consistently (`String(a) === String(b)`).
- The UI is `src/components/GroupChat.tsx`, wired into `Messages.tsx` as a
  "Groups" section in the sidebar plus a right-pane thread and a New-group modal.
  Uses `useGroups`/group queries from `src/lib/queries.ts`.
- Storage parity: `supabase/migrations/0005_groups.sql` defines the tables,
  `server/supabase/models.js` adds `app_groups` + member models, and
  `server/sheets/odm.js` handles array columns (e.g. `members`).

## Chat with Admin (support)

- `server/routes/chat.js` + `server/models/Chat.js` (Conversation/Message) back the
  student↔admin support thread. Students use `GET/POST /chat/me*`; admins use
  `/chat/conversations*` (guarded by `restrictTo('admin')`).
- The UI for it lives **only inside the Messages page**: `AdminChat` (student view)
  and `SupportInbox` (admin view) in `src/components/`. `Messages.tsx` branches on
  `isAdmin` to render the right side. Admins land on `/messages` after login, and
  reach the wider admin area from the account menu.
- The daily cleanup cron (`vercel.json` → `/api/v1/chat/cron/cleanup`) trims both
  peer and support messages.

## Admin panel

- `server/routes/admin.js` (`/api/v1/admin`, `protect` + `restrictTo('admin')`)
  backs the dashboard counters (`/admin/stats`), user administration
  (`/admin/users` list/create/update/delete) and thought moderation
  (`GET /admin/posts`, searchable by body or author name; hide/unhide and delete
  reuse `PATCH/DELETE /posts/:id`). Deleting a user removes their posts, stories,
  support thread, peer chats and created groups; Postgres cascades, Mongo and
  Sheets are cleaned up explicitly.
- The UI is `src/pages/admin/` (`AdminLayout`, `Dashboard`, `Users`, `Thoughts`,
  `Reports`), mounted at `/admin` and guarded by `RequireAdmin` in `src/App.tsx`.
  The support inbox is **not** duplicated there — it stays in Messages
  (`/messages`), linked from the admin sidebar and dashboard.
- `ModerationActions` (`src/components/ModerationActions.tsx`) is the single
  suspend/disable/reinstate control; the Users table, the Reports queue and the
  Thoughts list all mount it so an admin can act on an account inline.
- Only admins see the "Admin panel" entry in the account menu (`Navbar.tsx`).
- The daily cleanup cron (`vercel.json` → `/api/v1/chat/cron/cleanup`) trims both
  peer and support messages.

## Reports & suspensions

- A **suspension** is a user with `status: 'disabled'` plus a future
  `suspendedUntil`; `server/utils/suspension.js` (`isSuspended`, `liftIfExpired`)
  defines it, and `resolveUser` in `server/middleware/auth.js` lifts an expired one
  on the next request so the account works again without an admin action. A
  permanent disable (a "dismiss") is `disabled` with no `suspendedUntil`.
- Admins drive it through `PATCH /admin/users/:id` with an `action` of `suspend`
  (requires a future `suspendUntil`), `dismiss` or `reinstate`; the response user
  carries a derived `suspension` of `active | suspended | dismissed`. A bare
  `status` update is still accepted and clears any suspension.
- Reporting: `server/models/Report.js` + `server/routes/reports.js`
  (`POST /reports`, any signed-in user) flags a `post`, `story` or `user`. The
  reported row is resolved up front for a readable `targetLabel` and to reject
  missing/deleted targets; a duplicate open report by the same reporter is a 409.
- The admin queue is `GET /admin/reports` (filter by `status`/`kind`, paginated)
  and `PATCH /admin/reports/:id` (`action: resolve | dismiss`, optional
  `removeContent` deletes a reported post/story). `/admin/stats` adds
  `openReports` and `suspended` counters.
- UI: `ReportButton`/`ReportModal` (`src/components/ReportModal.tsx`) sit on posts,
  stories and profiles; the admin `Reports` page and the Users table's moderate
  modal (1h/24h/7d/30d picker) are in `src/pages/admin/`.
- Storage parity: `supabase/migrations/0006_reports.sql` adds `app_reports` and
  `app_users.suspended_until`; `server/supabase/models.js` and
  `server/sheets/models.js` add the report spec, and `google-apps-script/Code.gs`
  adds the `Reports` tab and the `suspendedUntil` user column. Run
  `npm run supabase:apply` after pulling.

## Stories & profiles

- `server/routes/stories.js` + `server/models/Story.js` (and `StoryView`). A story
  is an image that expires after 24 hours; the feed groups live stories by author
  and marks unseen ones. Views are one row per (story, viewer).
- Profile pictures live on `app_users.avatar`; the public profile endpoint is
  `GET /auth/users/:username`, and `/posts?author=<id>` backs a profile's thoughts.
- **All profile editing lives in one place**: `/account` (`src/pages/Account.tsx`)
  edits name, username, avatar and password. `/profile` is view-only and just
  links to `/account` — do not add a second editor back into `Profile.tsx`.
- Posting a thought happens **only** on the Thoughts feed (`/feed`, `Composer`);
  the home page and profile show thoughts read-only.
- Images are downscaled in the browser (`src/lib/image.ts`) and stored as data
  URLs, so there is no object storage. The API caps avatar/story payloads at
  ~1.5 MB, so raise both the client compression and the Zod limit together.

## Sign-up & auth

- **There is no sign-up.** Every student on the official roster already has an
  account, so the app is login-only: `AuthPanel` shows just Login + Forgot
  password, `/signup` redirects to `/login`, and `POST /auth/signup` was removed.
- Accounts are **provisioned from the roster**, never created by hand.
  `server/utils/accounts.js` `createStudentAccount(student, password?)` builds the
  user: the username is derived from the roster name (`usernameFromName`), the
  password defaults to registration number + admission number (e.g. `2500013411`),
  and duplicate names take a numeric suffix (`name.2`).
- It is called two ways: **lazily on first login** — if the identifier is an
  unknown username, `findStudentByUsername` looks up the roster row
  (`server/roster.js`) and creates the account on the spot — and **in bulk** by
  `npm run seed:students` (`server/scripts/seed-students.js`), which is idempotent
  and safe to re-run as the roster grows.
- Login is username/email + password (`POST /auth/login`); password reset still
  uses email OTP (`requestResetCode` / `resetPassword`).

## UI & design system

- "Editorial warmth" direction: a calm, community-journal feel.
- Tokens live in `src/index.css` (`@theme`): fonts `font-sans` (Plus Jakarta
  Sans) and `font-heading` (Fraunces), warm `ink-*` neutrals, `brand` (blue),
  `accent` (coral), plus a soft shadow scale (`shadow-soft`, `shadow-lift`).
  `index.html` loads both Google Fonts.
- Reuse the semantic classes rather than raw utilities: `.card`, `.btn-primary`,
  `.btn-dark`, `.btn-outline`, `.btn-ghost`, `.input`, `.label`, `.eyebrow`,
  `.animate-rise`, `.animate-pop`.
- **Use `ink-*` for neutrals, never `neutral-*`/`gray-*`** — a cold gray breaks
  the warm palette.
- Shared primitives are in `src/components/ui.tsx`: `Skeleton`, `FeedSkeleton`,
  `PostCardSkeleton`, `Toaster`, `Modal`, `EmptyState`, `ErrorState`, `Spinner`.
  Prefer content-shaped skeletons over a lone page spinner.
- Motion (staggered card reveals, springy like/story presses) must respect
  `prefers-reduced-motion`; it is disabled globally in `index.css`.

## Gotchas

- Apps Script POSTs answer 302 to `script.googleusercontent.com`; Node's fetch
  drops the body on redirect, so the client re-POSTs. Keep that behaviour.
- Frontend `useEffect` callbacks must not implicitly return a value that is not
  a function (React throws "destroy is not a function").
- The sandbox resets between sessions: Docker, MongoDB and the dev servers are
  gone on return and must be restarted.
- MongoDB Atlas (`*.mongodb.net`) is unreachable from the sandbox: TCP opens but
  TLS aborts (`ssl3_read_bytes:tlsv1 alert internal error`) because the Atlas IP
  allow-list rejects the sandbox egress IP. Add the IP (or `0.0.0.0/0`) in Atlas ▸
  Network Access, or run against the Supabase/Sheets datastore instead.
