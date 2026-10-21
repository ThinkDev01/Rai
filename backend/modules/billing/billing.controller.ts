// Billing HTTP handlers. Mounted at /api/v1/billing (billing.routes), owner/admin
// only. The webhook is mounted separately in app.ts (needs the raw body).

import type { Request, Response } from 'express';
import logger from '../../config/logger';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { verifyActionOtp } from '../otp/otp.service';
import { getBillingProvider } from './billing.factory';
import * as billing from './billing.service';
import type { BillingMode } from './billing.types';

const ROUTE = 'billing.controller';

function isMode(v: unknown): v is BillingMode {
  return v === 'recurring' || v === 'one_time';
}

// GET /api/v1/billing — the billing page payload (status, seats, amount, dates).
export async function getBilling(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.context!.org_id;
  const userId = req.user!.id;
  try {
    logger.info({ route: ROUTE, method: 'GET', userId, orgId }, 'Fetch billing summary');
    const summary = await billing.getSummary(orgId);
    res.status(200).json({ success: true, data: { billing: summary }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE, userId, orgId, error: (err as Error).message }, 'Fetch billing summary failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not load billing' } satisfies ApiResponse);
  }
}

// GET /api/v1/billing/invoices — past invoices/receipts (download links).
export async function getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.context!.org_id;
  const userId = req.user!.id;
  try {
    logger.info({ route: ROUTE, method: 'GET', userId, orgId }, 'Fetch invoices');
    const invoices = await billing.getInvoices(orgId);
    res.status(200).json({ success: true, data: { invoices }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE, userId, orgId, error: (err as Error).message }, 'Fetch invoices failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not load invoices' } satisfies ApiResponse);
  }
}

// POST /api/v1/billing/subscribe { mode } — start a paid subscription.
export async function subscribe(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.context!.org_id;
  const userId = req.user!.id;
  const { mode } = req.body as { mode?: unknown };
  if (!isMode(mode)) {
    res.status(400).json({ success: false, data: {}, error: "mode must be 'recurring' or 'one_time'" } satisfies ApiResponse);
    return;
  }
  try {
    logger.info({ route: ROUTE, method: 'POST', userId, orgId, mode }, 'Subscribe - start');
    const result = await billing.subscribe(orgId, mode);
    res.status(200).json({ success: true, data: { checkout: result }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE, userId, orgId, mode, error: (err as Error).message }, 'Subscribe failed');
    res.status(502).json({ success: false, data: {}, error: 'Could not start subscription. Check billing configuration.' } satisfies ApiResponse);
  }
}

// POST /api/v1/billing/confirm — confirm a completed checkout.
export async function confirm(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.context!.org_id;
  const userId = req.user!.id;
  const body = req.body as { orderId?: string; paymentId?: string; signature?: string; subscriptionId?: string };
  try {
    logger.info({ route: ROUTE, method: 'POST', userId, orgId }, 'Confirm payment - start');
    const summary = await billing.confirmPayment(orgId, body);
    res.status(200).json({ success: true, data: { billing: summary }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.warn({ route: ROUTE, userId, orgId, error: (err as Error).message }, 'Confirm payment failed');
    res.status(400).json({ success: false, data: {}, error: 'Payment could not be verified' } satisfies ApiResponse);
  }
}

// POST /api/v1/billing/cancel { code, immediate? } — OTP-gated cancellation.
export async function cancel(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId = req.context!.org_id;
  const userId = req.user!.id;
  const { code, immediate } = req.body as { code?: unknown; immediate?: unknown };

  // Sensitive action — verify the email OTP first (same gate as delete-org).
  const otp = await verifyActionOtp(userId, 'cancel_subscription', orgId, code);
  if (!otp.ok) {
    logger.warn({ route: ROUTE, userId, orgId, status: otp.status }, 'Cancel blocked - OTP check failed');
    res.status(otp.status).json({ success: false, data: {}, error: otp.error } satisfies ApiResponse);
    return;
  }

  try {
    logger.info({ route: ROUTE, method: 'POST', userId, orgId, immediate: immediate === true }, 'Cancel subscription - start');
    const summary = await billing.cancel(orgId, immediate === true);
    res.status(200).json({ success: true, data: { billing: summary }, error: '' } satisfies ApiResponse);
  } catch (err) {
    const message = (err as Error).message ?? '';
    const code = (err as NodeJS.ErrnoException).code;
    logger.error({ route: ROUTE, userId, orgId, code, error: message }, 'Cancel subscription failed');
    if (code === 'CANCEL_PROVIDER_ERROR') {
      // Razorpay refused the cancel — surface the real reason (this is an
      // owner/admin-only screen) instead of a blind 500 so it's actionable.
      res.status(502).json({ success: false, data: {}, error: `Could not cancel with the payment provider: ${message}` } satisfies ApiResponse);
    } else {
      res.status(500).json({ success: false, data: {}, error: 'Could not cancel subscription' } satisfies ApiResponse);
    }
  }
}

/**
 * POST /api/v1/billing/webhook — provider-driven lifecycle sync. PUBLIC (no auth
 * chain — the request is from Razorpay, not a user). Mounted in app.ts BEFORE
 * express.json with express.raw, so `req.body` is the raw Buffer needed for the
 * HMAC signature check. Always 200s on a verified event (even when ignored) so
 * the provider doesn't retry; 400/401 only on a missing/bad signature.
 */
export async function webhook(req: Request, res: Response): Promise<void> {
  const provider = getBillingProvider();
  const signature = req.header('x-razorpay-signature') ?? '';
  const raw = req.body as Buffer;

  if (!Buffer.isBuffer(raw) || !signature) {
    logger.warn({ route: ROUTE }, 'Webhook rejected - missing raw body or signature');
    res.status(400).json({ success: false, data: {}, error: 'Bad webhook' } satisfies ApiResponse);
    return;
  }
  if (!provider.verifyWebhookSignature(raw, signature)) {
    res.status(401).json({ success: false, data: {}, error: 'Invalid signature' } satisfies ApiResponse);
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).json({ success: false, data: {}, error: 'Bad JSON' } satisfies ApiResponse);
    return;
  }

  try {
    const event = provider.parseWebhookEvent(payload);
    await billing.applyWebhookEvent(event);
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    // Log + 200: a thrown handler shouldn't make the provider hammer us with
    // retries for a non-recoverable parse/state issue. We have the raw event logged.
    logger.error({ route: ROUTE, error: (err as Error).message }, 'Webhook processing failed');
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  }
}
