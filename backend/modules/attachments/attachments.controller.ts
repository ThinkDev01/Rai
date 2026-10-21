import type { Response } from 'express';
import { uuidv7 } from 'uuidv7';
import logger from '../../config/logger';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { param } from '../../types/common.types';
import { presignPut, presignGet, presignGetDownload, getBucket, deleteObject } from '../../config/s3';
import {
  type AttachmentScope, type PresignFileInput,
  ALLOWED_EXTENSIONS, buildKey, extensionOf,
  MAX_FILE_BYTES, TICKET_MAX_FILES, COMMENT_MAX_FILES, TICKET_MAX_TOTAL, COMMENT_MAX_TOTAL,
} from './attachments.types';
import { insertPendingAttachments, entityExistsInOrg, attachmentWithTicket, attachmentKeyForUrl, deleteByKeys } from './attachments.model';

const ROUTE = 'attachments.controller';

// POST /api/v1/attachments/presign { scope, entityId, files[] }
//
// Validates the whole batch (count, per-file ≤10 MB, extension allowlist,
// total cap — mirrors the frontend client-side checks), inserts `pending`
// rows, and returns one { key, uploadUrl } per file. The client PUTs straight
// to uploadUrl (raw fetch — no auth headers) and echoes the SAME keys back on
// the entity create request, where they're confirmed + linked.
//
// Keys are scheme D: orgs/{orgId}/attachments/{uuidv7}.{ext} — stable from
// here on; the DB row is the only linkage. entityId (for adding files to an
// EXISTING ticket/comment) is validated org-scoped; the create flow sends
// null.
export async function presignHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id } = req.context!;
  const body = (req.body ?? {}) as { scope?: unknown; entityId?: unknown; files?: unknown };

  logger.info(
    { route: ROUTE, method: 'POST', userId, orgId: org_id },
    'Attachment presign - start',
  );

  const scope = body.scope as AttachmentScope;
  if (scope !== 'ticket' && scope !== 'comment') {
    res.status(400).json({ success: false, data: {}, error: 'scope must be "ticket" or "comment"' } satisfies ApiResponse);
    return;
  }

  // entityId — a numeric string for existing entities (BIGSERIAL ids). null for
  // the create flow. Any other value is a 400.
  let entityId: number | null = null;
  if (body.entityId !== null && body.entityId !== undefined && body.entityId !== '') {
    if (typeof body.entityId !== 'string' || !/^\d+$/.test(body.entityId)) {
      res.status(400).json({ success: false, data: {}, error: 'entityId must be a numeric string when provided' } satisfies ApiResponse);
      return;
    }
    entityId = parseInt(body.entityId, 10);
    const column = scope === 'ticket' ? 'ticket_id' : 'comment_id';
    const exists = await entityExistsInOrg(column, entityId, org_id);
    if (!exists) {
      res.status(404).json({ success: false, data: {}, error: `${scope} not found in this organization` } satisfies ApiResponse);
      return;
    }
  }

  if (!Array.isArray(body.files) || body.files.length === 0) {
    res.status(400).json({ success: false, data: {}, error: 'files must be a non-empty array' } satisfies ApiResponse);
    return;
  }

  const maxFiles   = scope === 'ticket' ? TICKET_MAX_FILES  : COMMENT_MAX_FILES;
  const maxTotal   = scope === 'ticket' ? TICKET_MAX_TOTAL  : COMMENT_MAX_TOTAL;
  if (body.files.length > maxFiles) {
    res.status(400).json({ success: false, data: {}, error: `Maximum ${maxFiles} files per ${scope}` } satisfies ApiResponse);
    return;
  }

  // Validate each file against the allowlist + size cap, accumulating total.
  const files: PresignFileInput[] = [];
  let total = 0;
  for (const raw of body.files as PresignFileInput[]) {
    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    const mimeType = typeof raw?.mimeType === 'string' ? raw.mimeType : '';
    const size = typeof raw?.size === 'number' && Number.isFinite(raw.size) ? raw.size : NaN;

    if (!name) {
      res.status(400).json({ success: false, data: {}, error: 'Each file must have a name' } satisfies ApiResponse);
      return;
    }
    if (name.length > 255) {
      res.status(400).json({ success: false, data: {}, error: `Filename '${name.slice(0, 80)}' is too long (max 255 characters)` } satisfies ApiResponse);
      return;
    }
    if (!Number.isFinite(size) || size <= 0) {
      res.status(400).json({ success: false, data: {}, error: `Invalid size for '${name}'` } satisfies ApiResponse);
      return;
    }
    const ext = extensionOf(name);
    if (!ext || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      res.status(400).json({ success: false, data: {}, error: `'${name}' has an unsupported file type` } satisfies ApiResponse);
      return;
    }
    if (size > MAX_FILE_BYTES) {
      res.status(400).json({ success: false, data: {}, error: `'${name}' is exceeding 10 MB` } satisfies ApiResponse);
      return;
    }
    total += size;
    files.push({ name, mimeType, size });
  }
  if (total > maxTotal) {
    res.status(400).json({ success: false, data: {}, error: `Total attachment size exceeds the ${Math.round(maxTotal / (1024 * 1024))} MB limit` } satisfies ApiResponse);
    return;
  }

  try {
    const bucket = process.env['S3_BUCKET'] ?? '';
    if (!bucket) {
      logger.error({ route: ROUTE, userId, orgId: org_id }, 'S3_BUCKET not set - presign aborted');
      res.status(500).json({ success: false, data: {}, error: 'Storage is not configured' } satisfies ApiResponse);
      return;
    }

    // Build keys + pending rows in one pass, then presign the whole batch.
    const rows = files.map(f => {
      const id = uuidv7();
      return { id, name: f.name, mimeType: f.mimeType, size: f.size, key: buildKey(org_id, id, extensionOf(f.name)) };
    });
    await insertPendingAttachments(org_id, userId, rows);

    const signed = await Promise.all(rows.map(r => presignPut(bucket, r.key, r.mimeType)));
    const result = rows.map((r, i) => ({ key: r.key, uploadUrl: signed[i]! }));

    logger.info(
      { route: ROUTE, userId, orgId: org_id, scope, entityId, count: result.length },
      'Attachment presign - success',
    );
    res.status(201).json({ success: true, data: { files: result }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE, userId, orgId: org_id, scope, error: (err as Error).message },
      'Attachment presign - failed (pending rows left for the cleanup job)',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not generate upload links' } satisfies ApiResponse);
  }
}

// GET /api/v1/attachments/:id/url
//
// Regenerates a FRESH presigned GET URL (+ download URL) for one CONFIRMED
// attachment, org-scoped. The read payloads (ticket detail, comments) presign
// once at fetch time with a 15-min TTL — if the page sits open longer, those
// URLs expire and preview/download hit S3 with a dead link (XML "request has
// expired" error). This endpoint lets the client re-mint a URL right before the
// user opens the preview / hits Download, so no URL ever sits more than a
// moment past expiry. Pending (never-confirmed) rows 404 — the cleanup job owns
// those.
export async function attachmentUrlHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { org_id } = req.context!;
  const id = param(req, 'id');

  logger.info({ route: ROUTE, method: 'GET', userId: req.user!.id, orgId: org_id, id }, 'Attachment URL refresh - start');

  try {
    const row = await attachmentKeyForUrl(org_id, id);
    if (!row) {
      res.status(404).json({ success: false, data: {}, error: 'Attachment not found' } satisfies ApiResponse);
      return;
    }

    const bucket = getBucket();
    if (!bucket) {
      logger.error({ route: ROUTE, orgId: org_id, id }, 'S3_BUCKET not set - attachment URL refresh aborted');
      res.status(500).json({ success: false, data: {}, error: 'Storage is not configured' } satisfies ApiResponse);
      return;
    }

    const [url, downloadUrl] = await Promise.all([
      presignGet(bucket, row.key),
      presignGetDownload(bucket, row.key, row.name),
    ]);

    logger.info({ route: ROUTE, userId: req.user!.id, orgId: org_id, id }, 'Attachment URL refresh - success');
    res.status(200).json({ success: true, data: { url, downloadUrl }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE, userId: req.user!.id, orgId: org_id, id, error: (err as Error).message },
      'Attachment URL refresh - failed',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not generate a fresh link' } satisfies ApiResponse);
  }
}

// DELETE /api/v1/attachments/:id
//
// Deletes one CONFIRMED attachment: the S3 object + its DB row (cascade
// removes it from the ticket/comment read paths). Gated org-scoped plus the
// SAME can-edit rule as editing the ticket's description — admin tier, or the
// linked ticket's reporter/assignee. The uploader alone is NOT enough (the
// frontend Edit button is gated the same way), so a plain member can't delete
// a file they can't otherwise edit. Deleting a pending (never-confirmed)
// row is a 404 here; the cleanup job owns those.
export async function deleteAttachmentHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const id = param(req, 'id');

  logger.info({ route: ROUTE, method: 'DELETE', userId, orgId: org_id, id }, 'Delete attachment - start');

  try {
    const row = await attachmentWithTicket(org_id, id);
    if (!row) {
      res.status(404).json({ success: false, data: {}, error: 'Attachment not found' } satisfies ApiResponse);
      return;
    }

    const adminTier = role === 'owner' || role === 'admin' || role === 'project_manager';
    const canEdit = adminTier
      || (row.entity_ticket_id !== null && (row.reporter_id === userId || row.assignee_id === userId));
    if (!canEdit) {
      logger.warn({ route: ROUTE, userId, orgId: org_id, id }, 'Delete attachment - forbidden');
      res.status(403).json({ success: false, data: {}, error: 'You cannot delete this attachment' } satisfies ApiResponse);
      return;
    }

    const bucket = getBucket();
    if (bucket) {
      await deleteObject(bucket, row.key);
    } else {
      logger.warn({ route: ROUTE, orgId: org_id, id }, 'S3_BUCKET not set - deleting attachment row only');
    }
    await deleteByKeys([row.key]);

    logger.info({ route: ROUTE, userId, orgId: org_id, id }, 'Delete attachment - success');
    res.status(200).json({ success: true, data: { id }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE, userId, orgId: org_id, id, error: (err as Error).message },
      'Delete attachment - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not delete attachment' } satisfies ApiResponse);
  }
}
