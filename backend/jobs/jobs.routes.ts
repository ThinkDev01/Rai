// Internal job routes — called by AWS EventBridge Scheduler on each tick.
// Auth: shared secret in x-internal-secret header (set in EventBridge Connection).
// No Cognito token — EventBridge has no user context.
// Route: POST /api/v1/internal/jobs?job=:name  (single dispatch endpoint;
// one EventBridge API destination, `job` query param selects the handler).

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { runSprintAutostart } from './sprint-autostart.job';
import { runInviteCleanup } from './invite-cleanup.job';
import { runAttachmentCleanup } from './attachment-cleanup.job';
import { sweepTrialWarnings, sweepExpired } from '../modules/billing/billing.service';
import { purgeExpiredOrgs } from '../scripts/purge-orgs';
import type { ApiResponse } from '../types/common.types';

const router = Router();
const ROUTE = 'jobs.internal';

// Overlap guard — prevents a second EventBridge delivery running while the
// first is still in-flight. Returns 409 (not 5xx) so EventBridge does NOT
// retry (it only retries on 5xx/timeout).
const running = new Set<string>();

// Constant-time secret comparison — avoids timing attacks on the header value.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verifySecret(req: Request, res: Response, next: NextFunction): void {
  const secret = (process.env['INTERNAL_JOB_SECRET'] ?? '').trim();
  if (!secret) {
    logger.error({ route: ROUTE }, 'INTERNAL_JOB_SECRET not set — rejecting internal job call');
    res.status(503).json({ success: false, data: {}, error: 'Job runner not configured' } satisfies ApiResponse);
    return;
  }
  const provided = (req.header('x-internal-secret') ?? '').trim();
  if (!safeEqual(provided, secret)) {
    logger.warn({ route: ROUTE, job: req.query['job'] }, 'Internal job call rejected — bad secret');
    res.status(401).json({ success: false, data: {}, error: 'Unauthorized' } satisfies ApiResponse);
    return;
  }
  next();
}

const JOB_MAP: Record<string, () => Promise<unknown>> = {
  'billing-sweep': async () => {
    const warned = await sweepTrialWarnings();
    const swept  = await sweepExpired();
    return { warned, swept };
  },
  'invite-cleanup':   runInviteCleanup,
  'attachment-cleanup': runAttachmentCleanup,
  'sprint-autostart': runSprintAutostart,
  'purge-orgs':       purgeExpiredOrgs,
};

router.post('/', verifySecret, async (req: Request, res: Response): Promise<void> => {
  // Single dispatch endpoint — `?job=<name>` selects the handler.
  const raw = req.query['job'];
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) {
    logger.warn({ route: ROUTE }, 'Internal job call missing `job` query param');
    res.status(400).json({ success: false, data: {}, error: 'Missing job query parameter' } satisfies ApiResponse);
    return;
  }
  const run = JOB_MAP[name];
  if (!run) {
    logger.warn({ route: ROUTE, job: name }, 'Internal job not found');
    res.status(400).json({ success: false, data: {}, error: `Unknown job: ${name}` } satisfies ApiResponse);
    return;
  }
  if (running.has(name)) {
    logger.warn({ route: ROUTE, job: name }, 'Internal job skipped — previous run still in progress');
    res.status(409).json({ success: false, data: {}, error: 'Job already running' } satisfies ApiResponse);
    return;
  }
  running.add(name);
  logger.info({ route: ROUTE, job: name }, 'Internal job started');
  try {
    const result = await run();
    logger.info({ route: ROUTE, job: name, result }, 'Internal job completed');
    res.status(200).json({ success: true, data: { result }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE, job: name, error: (err as Error).message }, 'Internal job failed');
    res.status(500).json({ success: false, data: {}, error: 'Job failed' } satisfies ApiResponse);
  } finally {
    running.delete(name);
  }
});

export default router;
