import { readdir, readFile } from 'node:fs/promises';
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
//
// `npm run build` compiles the SQL into migrations.generated.js, which is part
// of server/** and therefore always bundled. Reading the .sql files from disk is
// the dev/test path (and a fallback if the generated file is absent).

// Arbitrary but fixed key so every process and `npm run supabase:apply` agree.
const MIGRATION_LOCK_KEY = 786341;

let done = false;
let inFlight = null;

async function loadMigrations() {
  try {
    const { MIGRATIONS } = await import('./migrations.generated.js');
    if (MIGRATIONS?.length) return MIGRATIONS;
  } catch {
    // no generated file (dev/test): read the .sql files directly
  }
  const dirs = [
    join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations'),
    join(process.cwd(), 'supabase/migrations'),
  ];
  for (const dir of dirs) {
    try {
      const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
      if (!files.length) continue;
      return Promise.all(
        files.map(async (name) => ({ name, sql: await readFile(join(dir, name), 'utf8') })),
      );
    } catch {
      // try the next candidate directory
    }
  }
  throw new Error('No migrations found (supabase/migrations)');
}

async function runMigrations() {
  const migrations = await loadMigrations();
  const client = await getPool().connect();
  try {
    // A transaction-scoped advisory lock (auto-released at commit) is safe behind
    // PgBouncer transaction pooling, unlike a session-level lock. A second process
    // racing on cold start simply blocks until the first commits, then re-runs the
    // idempotent files as fast no-ops.
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    for (const { sql } of migrations) {
      await client.query(sql);
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  console.info(`[supabase] applied ${migrations.length} migrations`);
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
