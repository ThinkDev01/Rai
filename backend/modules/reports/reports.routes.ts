import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireOrgContext } from '../../middleware/requireOrgContext';
import {
  burndownHandler,
  sprintReportHandler,
  velocityHandler,
} from './reports.controller';

// Mounted at /api/v1/projects/:id/reports via the projects router sub-mount.
// mergeParams exposes `:id` from the parent router.
const router = Router({ mergeParams: true });

const reader = [authMiddleware, requireOrgContext];

router.get('/burndown',      ...reader, burndownHandler);
router.get('/sprint-report', ...reader, sprintReportHandler);
router.get('/velocity',      ...reader, velocityHandler);

export default router;
