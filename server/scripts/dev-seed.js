import { User } from '../models/User.js';

export async function seedDev() {
  if (!(await User.exists({ username: 'admin' }))) {
    await User.create({ name: 'DHGRAM Admin', username: 'admin', email: 'admin@dhgram.local', password: 'admin12345', role: 'admin', emailVerified: true });
    await User.create({ name: 'Demo Student', username: 'student', email: 'student@dhgram.local', password: 'student12345', emailVerified: true });
    await User.create({ name: 'Demo Friend', username: 'friend', email: 'friend@dhgram.local', password: 'friend12345', emailVerified: true });
    console.info('[dev] Seeded admin (admin / admin12345), student (student / student12345) and friend (friend / friend12345)');
  }
}
