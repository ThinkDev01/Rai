import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { registerDevice, unregisterDevice } from './push.controller';

const router = Router();

// Device registry for mobile push. User-scoped (no org context) — a device
// belongs to the user and receives their cross-org notifications, same as the
// /notifications feed. The mobile app calls POST on login / token-refresh and
// DELETE on logout.
router.post('/',   authMiddleware, registerDevice);
router.delete('/', authMiddleware, unregisterDevice);

export default router;
