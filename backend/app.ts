import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { apiDocsPayload } from './config/apiDocs';
import { isDev } from './config/env';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import healthRoutes from './modules/health/health.routes';
import authRoutes from './modules/auth/auth.routes';
import meRoutes from './modules/me/me.routes';
import orgsRoutes from './modules/orgs/orgs.routes';
import invitesRoutes from './modules/invites/invites.routes';
import projectsRoutes from './modules/projects/projects.routes';
import searchRoutes from './modules/search/search.routes';
import usersRoutes from './modules/users/users.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import otpRoutes from './modules/otp/otp.routes';
import pushRoutes from './modules/push/push.routes';
import billingRoutes from './modules/billing/billing.routes';
import { webhook as billingWebhook } from './modules/billing/billing.controller';
import feedbackRoutes from './modules/feedback/feedback.routes';
import attachmentsRoutes from './modules/attachments/attachments.routes';
import jobsRoutes from './jobs/jobs.routes';
import logger from './config/logger';
import { requestContext, nextReqId } from './config/requestContext';
import type { ApiResponse } from './types/common.types';

const app = express();

// Trust proxy - required for correct client IP detection behind Nginx
app.set('trust proxy', 1);

// --- Security ---
app.use(helmet());
// Private-LAN regex: covers 192.168.x.x, 10.x.x.x, 172.16-31.x.x. Any
// port. Used to accept origins like http://192.168.88.16:3000 during
// mobile-on-same-Wi-Fi testing without per-tester env edits. Restricted
// to dev (ENVIRONMENT=dev) so a misconfigured prod server can't be accessed
// from arbitrary internal networks.
const LAN_ORIGIN_REGEX = /^https?:\/\/(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?$/;

app.use(cors({
  origin: (origin, callback) => {
    // CORS_ORIGIN is comma-separated → allow multiple origins from env alone,
    // no code change needed to add one. Read per-request so a restart that
    // reloads .env takes effect immediately. ngrok + LAN are dev-only convenience.
    const allowed = (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000')
      .split(',').map((o) => o.trim()).filter(Boolean);
    const ok =
      !origin ||
      allowed.includes(origin) ||
      (isDev && (origin.endsWith('.ngrok-free.app') || LAN_ORIGIN_REGEX.test(origin)));
    if (ok) {
      callback(null, true);
    } else {
      logger.warn({ origin, allowed, userId: 'system', route: 'cors' }, 'CORS rejected origin - not in CORS_ORIGIN allowlist');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // Explicit allowedHeaders list - reflection-by-default is unreliable when
  // credentials are enabled across some browser/version combos. X-Org-Id is
  // the per-tab org context carrier per the URL-driven org model; without
  // explicit allowlisting, browsers strip it from the preflight response and
  // the actual request fires WITHOUT the header, causing the backend to fall
  // back to the (stale) JWT claim - which is the cross-org contamination bug.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Org-Id'],
  // Expose Content-Disposition so the frontend (different port = cross-origin)
  // can read the server-set filename on file downloads (org data export).
  exposedHeaders: ['Content-Disposition'],
}));

// --- Billing webhook (raw body, BEFORE express.json) ---
// Razorpay signs the raw request bytes; express.json would parse them away and
// break the HMAC check. So this one route gets the raw Buffer. It's public
// (provider-to-server, no user auth) — the signature IS the authentication.
app.post('/api/v1/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }), billingWebhook);

// --- Core middleware ---
app.use(express.json({ limit: '10kb' }));
app.use(pinoHttp({
  logger,
  // Silence automatic request/response logs - controllers handle their own logging
  // with userId, route, and context already attached.
  autoLogging: false,
}));

// Assign a per-request id and carry it through the async chain via
// AsyncLocalStorage. The logger's `mixin` reads it, so every log line for one
// request shares the same reqId WITHOUT any controller passing it. Placed early
// so auth + rate-limit + controller logs are all tagged.
app.use((req, _res, next) => {
  requestContext.run({ reqId: nextReqId() }, next);
});

// Internal job routes bypass the rate limiter — EventBridge is a trusted AWS
// caller, not public traffic. Registered before rateLimiter so its IP pool
// can't be throttled into a retry cascade.
app.use('/api/v1/internal/jobs', jobsRoutes);

app.use(rateLimiter);

// --- Routes ---
app.use('/api',          healthRoutes);
app.use('/api/v1/auth',  authRoutes);
app.use('/api/v1/me',    meRoutes);
app.use('/api/v1/orgs',     orgsRoutes);
app.use('/api/v1/invites',  invitesRoutes);
app.use('/api/v1/projects', projectsRoutes);
app.use('/api/v1/users',    usersRoutes);
app.use('/api/v1/search',   searchRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/otp',           otpRoutes);
app.use('/api/v1/devices',       pushRoutes);
app.use('/api/v1/billing',       billingRoutes);
app.use('/api/v1/feedback',      feedbackRoutes);
app.use('/api/v1/attachments',   attachmentsRoutes);

// --- Manual API docs (additive, isolated — see config/apiDocs.ts). This is
// the active source for the frontend /docs page: reads Api-Documentation/
// at boot and serves it as JSON so the docs UI never hardcodes endpoint
// content. Removable by deleting this line + config/apiDocs.ts. ---
app.get('/api/docs', (_req: Request, res: Response) => res.json(apiDocsPayload));

// --- 404 handler ---
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    data: {},
    error: 'Route not found',
  } satisfies ApiResponse);
});

// --- Error handler (must be last) ---
app.use(errorHandler);

export default app;
