import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { beforeAll, afterAll } from 'vitest';

// Prefer .env.test (local throwaway DB) over .env. dotenv does NOT override keys
// already set, so loading .env.test FIRST makes it win; .env only fills gaps.
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Override for tests
process.env['DB_NAME'] = 'rai_test_db';
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';  // suppress pino logs during tests

// ── SAFETY GUARD ─────────────────────────────────────────────────────────────
// This suite DROPs and CREATEs rai_test_db on startup. If DB_HOST points at a
// remote/RDS instance (e.g. the staging .env), that would run destructive DDL
// against a live server. Refuse to run unless DB_HOST is an explicit local host.
// Fix: create backend/.env.test with DB_HOST=localhost (see .env.test.example).
const DB_HOST = process.env['DB_HOST'] ?? 'localhost';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres', 'postgres-db', 'db'];
if (!LOCAL_HOSTS.includes(DB_HOST)) {
  throw new Error(
    `\n[tests] Refusing to run against non-local DB_HOST="${DB_HOST}".\n` +
    `Integration tests DROP/CREATE rai_test_db — they must only touch a local DB.\n` +
    `Create backend/.env.test with DB_HOST=localhost (copy from .env.test.example).\n`,
  );
}

const adminPool = new Pool({
  host: DB_HOST,
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  user: process.env['DB_USER'] ?? 'rai_user',
  password: process.env['DB_PASSWORD'] ?? '',
  database: 'postgres',
});

const testPool = new Pool({
  host: DB_HOST,
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  user: process.env['DB_USER'] ?? 'rai_user',
  password: process.env['DB_PASSWORD'] ?? '',
  database: 'rai_test_db',
});

beforeAll(async () => {
  // Create test database
  await adminPool.query('DROP DATABASE IF EXISTS rai_test_db');
  await adminPool.query('CREATE DATABASE rai_test_db');
  await adminPool.end();

  // Run all migrations
  const migrationsDir = path.join(__dirname, '../config/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await testPool.query(sql);
  }

  await testPool.end();
}, 30000);

afterAll(async () => {
  const pool = (await import('../config/db')).default;
  await pool.end();
});
