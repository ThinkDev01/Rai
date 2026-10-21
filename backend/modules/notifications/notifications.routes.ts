import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import {
  getNotifications, getUnreadCount, postMarkRead, postMarkUnread, postMarkAllRead,
  getPreferences, patchPreferences,
} from './notifications.controller';

const router = Router();

// User-scoped feed — NOT org-scoped: the bell shows one cross-org inbox per user
// (each row carries its org slug for the deep-link). So only authMiddleware here,
// no requireOrgContext. Static paths are declared before the `/:id` param route.
router.get('/',               authMiddleware, getNotifications);
router.get('/unread-count',   authMiddleware, getUnreadCount);
router.get('/preferences',    authMiddleware, getPreferences);
router.patch('/preferences',  authMiddleware, patchPreferences);
router.post('/read-all',      authMiddleware, postMarkAllRead);
router.post('/:id/read',      authMiddleware, postMarkRead);
router.post('/:id/unread',    authMiddleware, postMarkUnread);

export default router;
