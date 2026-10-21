import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { attachOrgContext } from '../../middleware/requireOrgContext';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import { getBilling, getInvoices, subscribe, confirm, cancel } from './billing.controller';

// Billing routes are owner/admin only (guide-rbac.md → Manage billing). They use
// `attachOrgContext` (NOT `requireOrgContext`) on purpose: these endpoints MUST
// work while the org is read-only, since paying/reactivating/cancelling is how a
// suspended org recovers. The webhook is mounted separately in app.ts (raw body).
const router = Router();

const chain = [authMiddleware, attachOrgContext, requireOrgRole('owner', 'admin')] as const;

// GET /api/v1/billing — summary (status, seats, amount, dates).
router.get('/', authMiddleware, attachOrgContext, requireOrgRole('owner', 'admin'), getBilling);

// GET /api/v1/billing/invoices — past invoices/receipts (download links).
router.get('/invoices', ...chain, getInvoices);

// POST /api/v1/billing/subscribe { mode } — start recurring or one-time checkout.
router.post('/subscribe', ...chain, subscribe);

// POST /api/v1/billing/confirm — confirm a completed checkout / reactivate.
router.post('/confirm', ...chain, confirm);

// POST /api/v1/billing/cancel { code, immediate? } — OTP-gated cancellation.
router.post('/cancel', ...chain, cancel);

export default router;
