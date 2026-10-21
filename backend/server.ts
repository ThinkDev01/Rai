// env MUST be imported first - it loads .env before any other module reads it.
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

// --- Graceful shutdown (pool drain, exit cleanly on SIGTERM/SIGINT) ---
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal, userId: 'system', route: 'server' }, 'Shutdown signal received');
  stopLocalScheduler();
  await pool.end();
  logger.info({ userId: 'system', route: 'server' }, 'DB pool closed, exiting cleanly');
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT',  () => { void shutdown('SIGINT'); });

// --- Hard safety nets - never let a single error silently kill the server ---
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ error: err.message, stack: err.stack, userId: 'system', route: 'process' }, 'Unhandled promise rejection - keeping server alive');
});

process.on('uncaughtException', (err) => {
  logger.error({ error: err.message, stack: err.stack, userId: 'system', route: 'process' }, 'Uncaught exception - keeping server alive (state may be inconsistent)');
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

  const server = app.listen(PORT, () => {
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
