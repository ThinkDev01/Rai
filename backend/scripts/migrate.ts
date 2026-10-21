import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import logger from '../config/logger';

const MIGRATIONS_TABLE = 'schema_migrations';

// Fixed app-wide key for the Postgres advisory lock that serializes migration
// runs across instances. With multiple prod instances booting at once, the
// first acquires this lock and applies migrations; the rest wait, then find
// everything already applied and no-op. Single-instance (local/staging) grabs
// it instantly — zero behavioral change. The lock is session-scoped, so it's
// auto-released if the process dies, and must be acquired + released on the
// SAME connection (hence a dedicated client below).
const MIGRATION_LOCK_ID = 727101;

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id         SERIAL       PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL,
      ran_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_migration_filename UNIQUE (filename)
    )
  `);
}

async function getCompletedMigrations(): Promise<string[]> {
  const result = await pool.query<{ filename: string }>(
    `SELECT filename FROM ${MIGRATIONS_TABLE} ORDER BY ran_at ASC`
  );
  return result.rows.map(row => row.filename);
}

export async function runMigrations(): Promise<void> {
  logger.info({ userId: 'system', route: 'migration' }, 'Starting database migrations');

  // Hold the advisory lock on a single dedicated connection for the whole run.
  // Concurrent runners (other instances) block here until we release, so no two
  // instances ever apply migrations at the same time.
  const lockClient = await pool.connect();
  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    logger.info({ userId: 'system', route: 'migration' }, 'Acquired migration lock');

    await ensureMigrationsTable();
    const completed = await getCompletedMigrations();

    const migrationsDir = path.join(__dirname, '../config/migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let applied = 0;

    for (const file of files) {
      if (completed.includes(file)) {
        logger.info({ file, userId: 'system', route: 'migration' }, 'Already applied, skipping');
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES ($1)`,
          [file]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      logger.info({ file, userId: 'system', route: 'migration' }, 'Applied successfully');
      applied++;
    }

    logger.info(
      { total: files.length, applied, skipped: files.length - applied, userId: 'system', route: 'migration' },
      'All migrations complete'
    );
  } finally {
    // Always release the lock, even if a migration threw, so other instances
    // (and future runs) aren't blocked. unlock + release on the same client.
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
      logger.info({ userId: 'system', route: 'migration' }, 'Released migration lock');
    } catch (err) {
      logger.warn({ userId: 'system', route: 'migration', error: (err as Error).message }, 'Failed to release migration lock - will auto-release when session ends');
    }
    lockClient.release();
  }
}

// Run directly when called as a script: npm run migrate
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      logger.error({ error: (err as Error).message, userId: 'system', route: 'migration' }, 'Migration failed');
      process.exit(1);
    });
}
