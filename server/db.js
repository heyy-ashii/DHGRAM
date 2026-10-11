import mongoose from 'mongoose';
import { config } from './config.js';

mongoose.set('strictQuery', true);

let cached = globalThis.__dhgramMongo;
if (!cached) cached = globalThis.__dhgramMongo = { conn: null, promise: null };

export async function connectDB(uri = config.mongoUri) {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 })
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  cached.conn = null;
  cached.promise = null;
}
