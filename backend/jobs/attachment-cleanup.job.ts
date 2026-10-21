// Pending-attachment cleanup job (scheme D orphan sweep).
//
// A presign call inserts a `pending` row per file but nothing confirms it if
// the client never completes the create (closes the modal, upload fails, tab
// closed). Those files sit in S3 forever unless something sweeps them. This
// job:
//   1. finds `pending` rows older than 24h (created_at < NOW() - interval),
//   2. deletes each object from S3 (best-effort, continues on failure),
//   3. deletes the DB rows for keys whose object was removed (or never existed).
//
// Silent housekeeping — no notification. Idempotent. Triggered daily at
// 23:30 IST by EventBridge (end-of-day sweep); also runnable standalone:
// npm run jobs:attachment-cleanup

import pool from '../config/db';
import logger from '../config/logger';
import { getBucket, deleteObject } from '../config/s3';
import { pendingOrphanKeys, deleteByKeys } from '../modules/attachments/attachments.model';

const ROUTE = 'jobs.attachment-cleanup';

const SWEEP_WINDOW_HOURS = 24;

/** Sweep orphaned pending attachments. Returns { keys, deletedObjects, deletedRows }. */
export async function runAttachmentCleanup(): Promise<{ keys: number; deletedObjects: number; deletedRows: number }> {
  logger.info({ userId: 'system', route: ROUTE }, 'Attachment cleanup - sweep begin');

  const before = new Date(Date.now() - SWEEP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const keys = await pendingOrphanKeys(before);
  if (keys.length === 0) {
    logger.info({ userId: 'system', route: ROUTE }, 'Attachment cleanup - nothing to sweep');
    return { keys: 0, deletedObjects: 0, deletedRows: 0 };
  }

  const bucket = getBucket();
  let deletedObjects = 0;
  let deletedRows = 0;

  if (bucket) {
    const results = await Promise.all(keys.map((key) => deleteObject(bucket, key)));
    deletedObjects = results.filter(Boolean).length;
    deletedRows = await deleteByKeys(keys);
  } else {
    logger.warn({ userId: 'system', route: ROUTE }, 'S3_BUCKET not set - skipping object deletes, clearing rows only');
    deletedRows = await deleteByKeys(keys);
  }

  logger.info(
    { userId: 'system', route: ROUTE, keys: keys.length, deletedObjects, deletedRows },
    'Attachment cleanup - sweep done',
  );
  return { keys: keys.length, deletedObjects, deletedRows };
}

// Standalone run for manual testing: `npm run jobs:attachment-cleanup`.
if (require.main === module) {
  runAttachmentCleanup()
    .then(async (r) => {
      await pool.end();
      logger.info({ userId: 'system', route: ROUTE, ...r }, 'Attachment cleanup script finished');
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error(
        { userId: 'system', route: ROUTE, error: (err as Error).message, stack: (err as Error).stack },
        'Attachment cleanup script failed',
      );
      await pool.end().catch(() => { /* already failing - best effort */ });
      process.exit(1);
    });
}
