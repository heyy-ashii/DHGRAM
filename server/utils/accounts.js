import { User } from '../models/User.js';
import { initialPassword, usernameFromName } from '../roster.js';
import { AppError } from './AppError.js';

// Build an account for a student on the roster. Accounts are never created by
// hand in this app: every roster student already has one, provisioned here (on
// first login, or in bulk by the seed script).
//
// Two students can share a name (and so a derived username), so a numeric suffix
// is appended until the username is free. The password defaults to the roster
// value: registration number followed by the admission number.
export async function createStudentAccount(student, password) {
  let username = usernameFromName(student.name);
  if (username.length < 3) {
    throw new AppError('We could not build a username for that registration number. Please contact the admin.', 422);
  }
  if (await User.exists({ username })) {
    const base = username.replace(/\.\d+$/, '').slice(0, 27).replace(/^\.+|\.+$/g, '');
    let n = 2;
    while (await User.exists({ username })) {
      username = `${base}.${n}`;
      n += 1;
    }
  }
  return User.create({
    name: student.name,
    username,
    password: password ?? initialPassword(student),
    role: 'user',
    emailVerified: true,
    lastLoginAt: new Date(),
  });
}
