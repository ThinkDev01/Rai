import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireOrgContext } from '../../middleware/requireOrgContext';
import { presignHandler, attachmentUrlHandler, deleteAttachmentHandler } from './attachments.controller';

const router = Router();

// POST /api/v1/attachments/presign — auth + org context (write-gated by the
// subscription status via requireOrgContext, same as every mutating route).
router.post('/presign', authMiddleware, requireOrgContext, presignHandler);

// GET /api/v1/attachments/:id/url — auth + org context. Re-mints a fresh
// presigned GET/download URL for a CONFIRMED attachment (the read payloads'
// URLs expire after the 15-min presign TTL; refresh on preview-open).
router.get('/:id/url', authMiddleware, requireOrgContext, attachmentUrlHandler);

// DELETE /api/v1/attachments/:id — auth + org context. Permission checked
// inside the handler against the linked ticket (admin tier / uploader /
// reporter / assignee).
router.delete('/:id', authMiddleware, requireOrgContext, deleteAttachmentHandler);

export default router;
