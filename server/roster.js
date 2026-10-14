import { config } from './config.js';
import { AppError } from './utils/AppError.js';

// The signup allow-list lives in a public Google Sheet. A person may create an
// account only when their name and registration number appear on the same row.
//
//   | AD.NO | REG. NO | NAME                | PHONE | EMAIL |
//   | 3411  | 250001  | Sayyid Shaham AP    |       |       |
//
// Names repeat on the sheet (several students share a name), so the registration
// number is what makes a row unique. The sheet is exported as CSV, which needs no
// credentials while it is shared "anyone with the link". The raw text is cached
// briefly so a burst of signups does not hammer Google.

export function parseRosterCsv(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
    const adNo = cells[0];
    const regNo = cells[1];
    const name = cells[2];
    // Skips the title, the header and trailing blank rows.
    if (!adNo || !regNo || !name) continue;
    if (/^(ad\.?\s*no\.?|admission)$/i.test(adNo)) continue;
    if (/^reg\.?\s*no\.?$/i.test(regNo)) continue;
    rows.push({ adNo, regNo, name });
  }
  return rows;
}

const normAdNo = (v) => String(v ?? '').trim().toLowerCase().replace(/^u(?=\d)/, '');
export const normRegNo = (v) => String(v ?? '').trim().toLowerCase().replace(/^u(?=\d)/, '');
const normName = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

let cache = { at: 0, rows: [] };

async function fetchCsv() {
  const url = `https://docs.google.com/spreadsheets/d/${config.roster.sheetId}/export?format=csv`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new AppError('Could not read the student list right now. Please try again later.', 503);
  return res.text();
}

export async function loadRoster({ fresh = false } = {}) {
  if (config.roster.csv) return parseRosterCsv(config.roster.csv);
  const ttl = config.roster.cacheMinutes * 60 * 1000;
  if (!fresh && cache.rows.length && Date.now() - cache.at < ttl) return cache.rows;
  const rows = parseRosterCsv(await fetchCsv());
  cache = { at: Date.now(), rows };
  return rows;
}

export async function findStudentByRegNo(regNo) {
  const rows = await loadRoster();
  const wantRegNo = normRegNo(regNo);
  return rows.find((r) => normRegNo(r.regNo) === wantRegNo) ?? null;
}

// The username is derived from the roster name, so the reverse lookup finds the
// roster row a username belongs to. Used to provision an account on first login.
export async function findStudentByUsername(username) {
  const want = String(username ?? '').trim().toLowerCase();
  if (!want) return null;
  const rows = await loadRoster();
  return rows.find((r) => usernameFromName(r.name) === want) ?? null;
}

// A student may sign in with either their username or their registration number.
// A username is never all-digits (it is derived from a name), so an all-digit
// identifier is unambiguously a registration number and does not collide with a
// username on the roster.
export async function findStudentByIdentifier(identifier) {
  const want = String(identifier ?? '').trim().toLowerCase().replace(/^u(?=\d)/, '');
  if (!want) return null;
  if (/^\d+$/.test(want)) return findStudentByRegNo(want);
  return findStudentByUsername(want);
}

// Backwards-compatible name + registration lookup, kept for callers/tests that
// still pass a name.
export async function findStudent(name, regNo) {
  const rows = await loadRoster();
  const wantName = normName(name);
  const wantRegNo = normRegNo(regNo);
  return rows.find((r) => normName(r.name) === wantName && normRegNo(r.regNo) === wantRegNo) ?? null;
}

// The initial password is the registration number followed by the admission
// number, with no separator.
export function initialPassword(student) {
  return `${normRegNo(student.regNo)}${normAdNo(student.adNo)}`;
}

// "Muhammed Shamil KT" -> "muhammed.shamil.kt", a valid username for this app
// (lowercase letters, numbers, dot or underscore, 3-30 characters).
export function usernameFromName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30)
    .replace(/^\.+|\.+$/g, '');
}
