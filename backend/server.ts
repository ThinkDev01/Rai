// env MUST be imported first - it loads .env before any other module reads it.
import type { Server } from 'http';
import { validateEnv, logEnvSummary, logStartupBanner, isProd } from './config/env';
import app from './app';
import logger from './config/logger';
import pool from './config/db';
import { runMigrations } from './scripts/migrate';
import { isPushEnabled } from './config/firebase';
import { startLocalScheduler, stopLocalScheduler } from './jobs/local-scheduler';

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);
// Cron jobs runner. Default 'internal' = run crons inside this process via the
// internal job endpoint. Options:
//   - internal → in-process scheduler (local/dev)
//   - aws      → EventBridge Scheduler keeps invoking POST /api/v1/internal/jobs
const JOB_RUNNER = (process.env['JOB_RUNNER'] ?? 'internal').trim().toLowerCase();

// Set once listen() succeeds, so shutdown can stop accepting connections.
let httpServer: Server | null = null;
let shuttingDown = false;

// Upper bound on a graceful shutdown. Past this, in-flight work is abandoned
// and the process exits anyway (Docker's stop timeout is 10s by default).
const SHUTDOWN_TIMEOUT_MS = 8000;

// --- Graceful shutdown: stop new connections, drain in-flight, close pool ---
async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason, exitCode, userId: 'system', route: 'server' }, 'Shutting down - no longer accepting new requests');

  // Hard deadline: never hang on a stuck request or DB call.
  setTimeout(() => {
    console.error(`[FATAL] Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms - forcing exit`);
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  stopLocalScheduler();
  try {
    if (httpServer) {
      const server = httpServer;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.info({ userId: 'system', route: 'server' }, 'In-flight requests finished, HTTP server closed');
    }
    await pool.end();
    logger.info({ userId: 'system', route: 'server' }, 'DB pool closed, exiting');
  } catch (err) {
    logger.error({ error: (err as Error).message, userId: 'system', route: 'server' }, 'Error during shutdown - exiting anyway');
  }
  process.exit(exitCode);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM', 0); });
process.on('SIGINT',  () => { void shutdown('SIGINT', 0); });

// --- Safety nets ---
// Rejections are logged and the server keeps running: they're usually a
// forgotten await on fire-and-forget work (e.g. a notification send) and
// don't corrupt process state.
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ error: err.message, stack: err.stack, userId: 'system', route: 'process' }, 'Unhandled promise rejection - keeping server alive');
});

// An uncaught exception leaves the process in an unknown state (Node docs:
// "it is not safe to resume normal operation"). Log it, drain gracefully and
// exit non-zero; Docker's `restart: always` brings up a clean process.
process.on('uncaughtException', (err) => {
  logger.fatal({ error: err.message, stack: err.stack, userId: 'system', route: 'process' }, 'Uncaught exception - shutting down so the container restarts clean');
  void shutdown('uncaughtException', 1);
});

// --- Bootstrap ---
async function startServer(): Promise<void> {
  validateEnv(logger);
  logEnvSummary(logger);
  await runMigrations();

  // Eagerly init Firebase Admin so a missing/bad FCM credential surfaces at boot
  // (logged inside the config) rather than lazily on the first push. Non-fatal:
  // push is an enhancement on top of the always-on in-app + email channels.
  isPushEnabled();

  // Cron jobs: internal runner replaces EventBridge for local/dev runs.
  if (JOB_RUNNER === 'internal') {
    startLocalScheduler();
  }

  const server = httpServer = app.listen(PORT, () => {
    logger.info({ port: PORT, environment: isProd ? 'prod' : 'dev', jobRunner: JOB_RUNNER, userId: 'system', route: 'server' }, 'Rai API server started');
    logStartupBanner(logger, PORT);
  });

  // Bind errors are fatal - fail fast with a clear message instead of dying silently.
  server.on('error', (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    logger.error({ error: err.message, code, userId: 'system', route: 'server' }, 'HTTP server error');
    if (code === 'EADDRINUSE' || code === 'EACCES') {
      // Synchronous stderr - pino's transport may not flush before exit.
      console.error(`\n[FATAL] Port ${PORT} is unavailable (${code}). Another process is using it.`);
      console.error(`  Find it:  netstat -ano | grep :${PORT}`);
      console.error(`  Kill it:  taskkill //PID <pid> //F\n`);
      process.exit(1);
    }
  });
}

startServer().catch(err => {
  logger.error({ error: (err as Error).message, userId: 'system', route: 'server' }, 'Failed to start server');
  process.exit(1);
});
