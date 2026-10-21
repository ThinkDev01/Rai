import { Pool, types as pgTypes } from 'pg';
import logger from './logger';

// .env is loaded by ./env (imported transitively via ./logger) before this
// module reads any DB_* var — no dotenv.config() needed here.

// BIGINT → JS number at the driver level (Q13 / standards.md §2).
// Without this, the pg driver returns BIGINT (OID 20) as a string to preserve
// precision past 2^53-1. We cast to number so every BIGSERIAL primary key
// (projects, sprints, tickets, comments, ticket_status_history) is consistent
// across services, controllers, and frontend payloads. Risk is theoretical at
// our scale (~10^15 rows per table). OID 20 = int8/BIGINT.
pgTypes.setTypeParser(20, (val) => parseInt(val, 10));

// SSL is auto-detected from DB_HOST — no extra env var to remember:
//   - localhost / 127.0.0.1   → no SSL (local Docker Postgres can't speak TLS)
//   - anything else           → SSL on (RDS / Supabase / any managed Postgres)
//
// This means the same .env shape works for both local and deployed; the
// only thing that changes between environments is DB_HOST. Earlier we had
// an explicit DB_SSL toggle, but it added a "remember to flip this" step
// that bit on the first staging deploy.
//
// `rejectUnauthorized: false` skips CA chain validation against AWS RDS's
// root cert. Fine for VPC-internal API → RDS traffic where MITM isn't a
// realistic threat. Ship the AWS RDS root cert here later to tighten.
const dbHost = process.env['DB_HOST'] ?? 'localhost';
const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
const useSsl = !isLocal;

logger.info(
  { userId: 'system', route: 'db', host: dbHost, db: process.env['DB_NAME'], ssl: useSsl },
  'DB pool init',
);

const pool = new Pool({
  host: dbHost,
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  user: process.env['DB_USER'] ?? 'rai_user',
  password: process.env['DB_PASSWORD'] ?? '',
  database: process.env['DB_NAME'] ?? 'rai_db',
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Catch idle client errors so they don't bubble up as uncaught exceptions.
// We log and let the pool self-heal - pg internally drops the bad client and
// creates a new one on the next query. NEVER process.exit here: an idle
// network blip should not take the whole server down.
pool.on('error', (err) => {
  logger.error({ error: err.message, userId: 'system', route: 'db' }, 'Idle DB pool client error - pool will reconnect on next query');
});

export default pool;
