// Usage: npm run seed:students
// Creates an account for every student on the roster sheet who does not have one
// yet, with the default password (registration number + admission number). Idempotent:
// existing usernames are skipped, so it is safe to re-run as the roster grows.
//
// MongoDB is connected when it is the datastore; Sheets and Supabase connect
// lazily. Set the datastore env vars the same way the server uses them.
import { datastore } from '../config.js';
import { connectDB, disconnectDB } from '../db.js';
import { User } from '../models/User.js';
import { loadRoster, initialPassword, usernameFromName } from '../roster.js';
import { createStudentAccount } from '../utils/accounts.js';

const usingMongo = datastore() === 'mongo';
if (usingMongo) await connectDB();

const students = await loadRoster({ fresh: true });
if (students.length === 0) {
  console.error('The roster is empty. Check ROSTER_SHEET_ID / ROSTER_CSV.');
  process.exit(1);
}

let created = 0;
let skipped = 0;
let failed = 0;
for (const student of students) {
  const base = usernameFromName(student.name);
  if (base.length < 3) {
    failed += 1;
    console.warn(`Skipped ${student.regNo} (${student.name}): no usable username.`);
    continue;
  }
  // A shared name takes a numeric suffix, so any of those variants means the
  // student already has an account.
  const existing = await User.findOne({ username: new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.\\d+)?$`) });
  if (existing) {
    skipped += 1;
    continue;
  }
  try {
    const user = await createStudentAccount(student);
    created += 1;
    console.info(`Created ${user.username} (${student.regNo}) - password ${initialPassword(student)}`);
  } catch (err) {
    failed += 1;
    console.warn(`Failed ${student.regNo} (${student.name}): ${err.message}`);
  }
}

console.info(`\nDone. ${created} created, ${skipped} already existed, ${failed} skipped.`);
if (usingMongo) await disconnectDB();
