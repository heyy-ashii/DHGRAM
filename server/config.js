import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

// Guard rail: the test suite truncates tables on startup, so it must never point
// at a hosted database. A stray SUPABASE_DB_URL in .env would let a test run wipe
// production data.
if (env.NODE_ENV === 'test' && env.SUPABASE_DB_URL && !/@(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(env.SUPABASE_DB_URL)) {
  throw new Error('Refusing to run tests against a non-local SUPABASE_DB_URL');
}

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT) || 4000,
  mongoUri: env.MONGODB_URI || '',
  jwtSecret: env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
  cookieName: 'dhgram_token',
  corsOrigins: (env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  appUrl: env.APP_URL || 'http://localhost:5173',
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 465,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || env.SMTP_USER || 'DHGRAM <dhgram.app@gmail.com>',
  },
  sheets: {
    apiUrl: env.SHEETS_API_URL || '',
    apiToken: env.SHEETS_API_TOKEN || '',
    timeoutMs: Number(env.SHEETS_TIMEOUT_MS) || 8000,
  },
  supabase: {
    url: env.SUPABASE_URL || '',
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY || '',
    // Bypasses RLS. Server-side only; never ship this to the browser.
    secretKey: env.SUPABASE_SECRET_KEY || '',
    jwksUrl: env.SUPABASE_JWKS_URL || '',
    // Optional direct Postgres connection string. When set, the Supabase
    // driver talks SQL over pg instead of HTTP through PostgREST.
    dbUrl: env.SUPABASE_DB_URL || '',
    timeoutMs: Number(env.SUPABASE_TIMEOUT_MS) || 10000,
    // Run supabase/migrations/*.sql on first request so a deploy never depends
    // on the migrations being applied by hand. Set SUPABASE_AUTO_MIGRATE=false
    // to turn it off (e.g. a locked-down production database).
    autoMigrate: env.SUPABASE_AUTO_MIGRATE !== 'false',
  },
  otp: {
    ttlMinutes: 10,
    maxAttempts: 5,
    resendCooldownSeconds: 60,
  },
  roster: {
    // Public Google Sheet listing the students allowed to create an account.
    sheetId: env.ROSTER_SHEET_ID || '104OzyflQpqmew1zUU-v4m1UGSaEr8jX5vHNor3xev_U',
    cacheMinutes: Number(env.ROSTER_CACHE_MINUTES) || 10,
    // Tests read the roster from this inline CSV instead of the network.
    csv: env.ROSTER_CSV || '',
  },
  login: {
    maxFailedAttempts: 5,
    lockMinutes: 15,
  },
  chat: {
    // Messages older than this are deleted so the chat stays lean. Applied when a
    // conversation is read and by the daily cleanup endpoint.
    get retentionDays() {
      return Number(env.CHAT_RETENTION_DAYS) || 30;
    },
  },
  get cronSecret() {
    return env.CRON_SECRET || '';
  },
};

export const emailConfigured = () => Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
export const sheetsConfigured = () => Boolean(config.sheets.apiUrl && config.sheets.apiToken);

// The Supabase driver talks to Postgres, so SUPABASE_DB_URL is what enables it.
// SUPABASE_SECRET_KEY alone is not enough: PostgREST cannot run DDL, and the
// secret key is only needed later if we add the REST transport or Supabase Auth.
export const supabaseConfigured = () => Boolean(config.supabase.url && config.supabase.dbUrl);

// The datastore the models use. Supabase wins when configured, then Sheets,
// then MongoDB. Set SUPABASE_DB_URL to switch over; remove it to fall back.
export const datastore = () =>
  supabaseConfigured() ? 'supabase' : sheetsConfigured() ? 'sheets' : 'mongo';
