// In-process job scheduler — replaces AWS EventBridge for local/dev runs.
//
// Gate: JOB_RUNNER=internal (default when unset? No — default off). Set
// JOB_RUNNER=internal in .env to run jobs inside the API process. Each job is
// dispatched by POSTing to the SAME internal endpoint EventBridge uses
// (/api/v1/internal/jobs?job=<name>), so the shared-secret auth + overlap guard
// in jobs.routes.ts apply unchanged — a self-trigger can never stack runs.
//
// Cadence mirrors the intent of the EventBridge schedules:
//   - sprint-autostart    hourly   (sprinkles miss the exact moment otherwise)
//   - invite-cleanup      6-hourly (IP-vest only)
//   - billing-sweep       daily
//   - attachment-cleanup  daily (orphaned S3 objects)
//   - purge-orgs          daily    (soft-deleted org hard purge)
// Initial runs are staggered after boot so a restart doesn't fire all five at
// once; failures are logged, never fatal (the next tick simply retries).

import logger from '../config/logger';

interface JobSchedule {
  name: string;
  everyMs: number;
  initialDelayMs: number;
}

const JOBS: JobSchedule[] = [
  { name: 'sprint-autostart',    everyMs: 60 * 60 * 1000,       initialDelayMs: 5_000 },
  { name: 'invite-cleanup',      everyMs: 6 * 60 * 60 * 1000,   initialDelayMs: 20_000 },
  { name: 'billing-sweep',       everyMs: 24 * 60 * 60 * 1000,  initialDelayMs: 35_000 },
  { name: 'attachment-cleanup',  everyMs: 24 * 60 * 60 * 1000,  initialDelayMs: 50_000 },
  { name: 'purge-orgs',          everyMs: 24 * 60 * 60 * 1000,  initialDelayMs: 65_000 },
];

const timers: NodeJS.Timeout[] = [];

function trigger(name: string): void {
  const secret = (process.env['INTERNAL_JOB_SECRET'] ?? '').trim();
  const port   = process.env['PORT'] ?? '4000';
  if (!secret) {
    logger.warn(
      { job: name, userId: 'system', route: 'jobs.local-scheduler' },
      'Local job skipped - INTERNAL_JOB_SECRET not set',
    );
    return;
  }

  fetch(`http://localhost:${port}/api/v1/internal/jobs?job=${name}`, {
    method: 'POST',
    headers: { 'x-internal-secret': secret },
  })
    .then((res) => {
      if (res.ok || res.status === 409) {
        logger.info(
          { job: name, status: res.status, userId: 'system', route: 'jobs.local-scheduler' },
          'Local job dispatched',
        );
      } else {
        logger.warn(
          { job: name, status: res.status, userId: 'system', route: 'jobs.local-scheduler' },
          'Local job dispatched - non-success status',
        );
      }
    })
    .catch((err) => {
      logger.warn(
        { job: name, error: (err as Error).message, userId: 'system', route: 'jobs.local-scheduler' },
        'Local job dispatch failed - will retry on next tick',
      );
    });
}

let started = false;

/** Start the in-process scheduler (idempotent). Must run after app.listen. */
export function startLocalScheduler(): void {
  if (started) return;
  started = true;
  for (const job of JOBS) {
    timers.push(
      setTimeout(() => {
        trigger(job.name);
        timers.push(setInterval(() => trigger(job.name), job.everyMs));
      }, job.initialDelayMs),
    );
  }
  logger.info(
    { jobs: JOBS.map((j) => j.name), userId: 'system', route: 'jobs.local-scheduler' },
    'Local job scheduler started - JOB_RUNNER=internal',
  );
}

/** Stop all pending + recurring ticks (used on graceful shutdown). */
export function stopLocalScheduler(): void {
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
  started = false;
}