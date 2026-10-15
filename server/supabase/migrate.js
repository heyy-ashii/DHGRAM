import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getPool } from './db.js';

// Applies every SQL file in supabase/migrations, in name order, on first use so
// a deploy can never run against a database that lags the code. This is the same
// set `npm run supabase:apply` runs; every file is idempotent (`if not exists`,
// `drop trigger if exists`) and additive, so re-running is safe.
//
// It runs inside a Postgres advisory lock and is memoised per process, so the
// many concurrent requests a serverless cold start handles apply it once. A
// failure is not fatal: the ODM degrades (reads empty, writes 503) and the next
// request retries, so a transient database blip does not wedge the process.

// The migrations live beside the source in dev, but a serverless bundle may be
// flattened, so fall back to the deploy root (Vercel runs from /var/task).
const CANDIDATE_DIRS = [
  join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations'),
  join(process.cwd(), 'supabase/migrations'),
];

async function migrationsDir() {
  for (const dir of CANDIDATE_DIRS) {
    try {
      await access(dir);
      return dir;
    } catch {
      // try the next candidate
    }
  }
  return CANDIDATE_DIRS[0];
}

// Arbitrary but fixed key so every process and `npm run supabase:apply` agree.
const MIGRATION_LOCK_KEY = 786341;

let done = false;
let inFlight = null;

async function runMigrations() {
  const dir = await migrationsDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const client = await getPool().connect();
  try {
    // A transaction-scoped advisory lock (auto-released at commit) is safe behind
    // PgBouncer transaction pooling, unlike a session-level lock. A second process
    // racing on cold start simply blocks until the first commits, then re-runs the
    // idempotent files as fast no-ops.
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    for (const file of files) {
      await client.query(await readFile(join(dir, file), 'utf8'));
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  console.info(`[supabase] applied ${files.length} migrations`);
}

// Apply the schema at most once per process. Concurrent callers share the first
// run; a failed run clears the memo so the next caller retries.
export function ensureSchema() {
  if (!config.supabase.autoMigrate) return Promise.resolve();
  if (done) return Promise.resolve();
  if (!inFlight) {
    inFlight = runMigrations()
      .then(() => {
        done = true;
      })
      .catch((err) => {
        console.error('[supabase] migration failed:', err.message);
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// Exposed for tests to force a re-run.
export function resetSchemaMemo() {
  done = false;
  inFlight = null;
}
