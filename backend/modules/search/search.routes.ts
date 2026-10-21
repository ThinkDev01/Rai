import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireOrgContext } from '../../middleware/requireOrgContext';
import { searchHandler } from './search.controller';

const router = Router();

// GET /api/v1/search?q= - org-scoped, visibility-aware ticket search.
router.get('/', authMiddleware, requireOrgContext, searchHandler);

export default router;
