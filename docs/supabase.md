# Supabase datastore

DHGRAM can run entirely on Supabase (Postgres) instead of MongoDB or Google Sheets.
Set one environment variable, `SUPABASE_DB_URL`, and users, OTPs, chats, posts
and messages all move to Postgres. Unset it and the app falls back to Sheets,
then MongoDB. Nothing else in the code changes.

The driver lives in `server/supabase/`:

| File | Role |
| --- | --- |
| `db.js` | `pg` connection pool. SSL on for remote hosts, off for localhost. |
| `sql.js` | Turns the Mongo-style filters the routes send into parameterised SQL. |
| `odm.js` | Mongo-like collection API (`find`, `findOne`, `save`, `populate`, `aggregate`). |
| `models.js` | Column maps and specs for users, OTPs, conversations, messages, posts and peer chats. |

The schema is the set of files in `supabase/migrations/` (starting at
`0001_init.sql`). Tables are prefixed `app_` so they never collide with
Supabase's own `auth`, `storage` and `realtime` schemas.

## 1. Create the tables

The app applies every `supabase/migrations/*.sql` **automatically on the first
API request** (see `server/supabase/migrate.js`), so a deploy provisions its own
schema and you normally have nothing to run. If you would rather do it by hand
(the same files, in name order), either paste them into the Supabase dashboard
(SQL Editor > New query > Run), or run:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_DB_URL='postgresql://...' \
npm run supabase:apply
```

## 2. Get the connection string

Supabase dashboard > Project Settings > Database > Connection string > **Connection
pooling** (URI tab). It looks like:

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Use port **6543** (transaction mode). On Vercel the direct connection on 5432 will
exhaust Postgres's connection limit. The `pg` driver does not name its prepared
statements, so it is compatible with the transaction-mode pooler.

Set these in `.env` locally and in the Vercel project settings for deploys:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_DB_URL=postgresql://...
```

The `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_JWKS_URL`
values are not needed by this driver. They are stored for later Supabase Auth or
REST work. The secret key bypasses Row Level Security, so keep it server-side.

## 3. Seed an admin

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='a-strong-password' npm run seed:admin
```

The script detects the active datastore and skips the MongoDB connection in
Supabase mode.

## Security notes

The migration enables Row Level Security on every `app_` table and adds no
policies, so the publishable key can read nothing: password hashes and OTP codes
are never exposed to the browser. The backend reaches the tables through the
direct Postgres connection, which bypasses RLS.

## Testing

`server/tests/supabase.test.js` runs the whole API against a real Postgres and
skips itself when `TEST_DATABASE_URL` is unset:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/dhgram npm test
```

It covers signup with OTP, the resend cooldown, login and lockout, the posts feed,
and the full chat flow.
