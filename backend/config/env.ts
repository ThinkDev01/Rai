import dotenv from 'dotenv';
import type { Logger } from 'pino';

// Load .env BEFORE anything else reads process.env. Every other config module
// (logger, db, app) imports from here, so this side effect always runs first.
// In the container the .env is mounted (not baked), so a restart re-reads it.
dotenv.config();

// Two environments only: 'dev' (local) and 'prod' (any deployment — staging or
// production), read from our own ENVIRONMENT var. We also accept the long Node
// spellings, and fall back to NODE_ENV if ENVIRONMENT is unset. We then set the
// canonical NODE_ENV underneath so Express + libs that check it internally
// behave correctly — but never clobber the test runner's NODE_ENV=test.
const raw = (process.env['ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'dev').trim().toLowerCase();
export const isProd = raw === 'prod' || raw === 'production';
export const isDev = !isProd;
if (process.env['NODE_ENV'] !== 'test') {
  process.env['NODE_ENV'] = isProd ? 'production' : 'development';
}

// Which auth provider this run uses. Default: 'manual' (our DB-backed
// provider, also accepted as 'custom'). 'aws' = Cognito. Drives the required
// env below so a manual run never asks for AWS/Cognito keys, and vice versa.
export const authProviderMode: 'aws' | 'manual' =
  (process.env['AUTH_PROVIDER'] ?? 'manual').trim().toLowerCase() === 'aws' ? 'aws' : 'manual';

// Required in every environment.
const REQUIRED = [
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'CORS_ORIGIN',
];

// AWS mode: static keys (not an EC2 role) are needed for Cognito admin calls.
if (authProviderMode === 'aws') {
  REQUIRED.push(
    'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
    'COGNITO_USER_POOL_ID', 'COGNITO_APP_CLIENT_ID',
  );
} else {
  // Manual mode: JWT signing secret replaces the Cognito pool/region/creds.
  REQUIRED.push('JWT_SECRET');
}

// S3_BUCKET is optional in both modes — attachments are a "coming soon" feature
// and every S3 call already handles a null bucket.

// Billing — Razorpay is the ONLY provider (no fallback), so every key it
// needs is required in every environment. Missing any one stops the server at
// boot instead of letting billing fail at the user's first click.
REQUIRED.push(
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_PLAN_ID', 'RAZORPAY_WEBHOOK_SECRET',
);

// Show first 3 + last 4 chars so secrets can be cross-checked after a deploy
// without printing the full value (last 4 keeps a trailing port like :3000
// fully visible, e.g. ap-…6Xl / …:3000).
function mask(value: string | undefined): string {
  if (!value) return '(unset)';
  const v = value.trim();
  return v.length <= 8 ? `${v.slice(0, 1)}…(len ${v.length})` : `${v.slice(0, 3)}…${v.slice(-4)}`;
}

export function validateEnv(log: Logger): void {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    log.error({ missing, userId: 'system', route: 'env' }, 'Missing required env vars - aborting startup');
    // Deliberate, logged exit: the app cannot run with missing config. Sync
    // stderr because pino's transport may not flush before exit.
    console.error(`\n[FATAL] Missing required env vars: ${missing.join(', ')}\n`);
    process.exit(1);
  }
}

// One masked snapshot of what the process actually booted with. URLs, region
// and CORS are safe in full; identifiers and secrets are masked.
export function logEnvSummary(log: Logger): void {
  // All the masked values nest under a single `config` object so the log line
  // carries one clean JSON blob you can copy + format, instead of the fields
  // flattened among the log metadata (userId/route/reqId).
  log.info(
    {
      userId: 'system', route: 'env',
      config: {
        ENVIRONMENT: isProd ? 'prod' : 'dev',
        PORT: process.env['PORT'] ?? '4000',
        LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
        CORS_ORIGIN: process.env['CORS_ORIGIN'],
        FRONTEND_BASE_URL: process.env['FRONTEND_BASE_URL'],
        AUTH_PROVIDER: authProviderMode,
        AWS_REGION: process.env['AWS_REGION'],
        S3_BUCKET: process.env['S3_BUCKET'] ?? '(unset)',
        S3_PRESIGN_EXPIRES: process.env['S3_PRESIGN_EXPIRES'] ?? '900 (default)',
        DB_HOST: mask(process.env['DB_HOST']),
        DB_USER: mask(process.env['DB_USER']),
        DB_PASSWORD: mask(process.env['DB_PASSWORD']),
        DB_NAME: mask(process.env['DB_NAME']),
        AWS_ACCESS_KEY_ID: mask(process.env['AWS_ACCESS_KEY_ID']),
        AWS_SECRET_ACCESS_KEY: mask(process.env['AWS_SECRET_ACCESS_KEY']),
        COGNITO_USER_POOL_ID: mask(process.env['COGNITO_USER_POOL_ID']),
        COGNITO_APP_CLIENT_ID: mask(process.env['COGNITO_APP_CLIENT_ID']),
        // Manual-mode JWT signing secret — required when AUTH_PROVIDER=manual.
        JWT_SECRET: process.env['JWT_SECRET'] ? mask(process.env['JWT_SECRET']) : '(unset)',
        // Email — Resend (free tier). Key asserted at send-time, not boot.
        RESEND_API_KEY: process.env['RESEND_API_KEY'] ? '(set - email enabled)' : '(unset - email disabled)',
        RESEND_FROM_EMAIL: process.env['RESEND_FROM_EMAIL'] ?? process.env['SES_FROM_EMAIL'] ?? '(unset)',
        // Optional — mobile push. Show only whether it's set (the value is a whole
        // service-account credential, never partially printed).
        FIREBASE_SERVICE_ACCOUNT: process.env['FIREBASE_SERVICE_ACCOUNT'] ? '(set - push enabled)' : '(unset - push disabled)',
        // Required — Razorpay is the only billing provider (no fallback). All
        // four are validated at boot by validateEnv().
        RAZORPAY_KEY_ID: mask(process.env['RAZORPAY_KEY_ID']),
        RAZORPAY_KEY_SECRET: mask(process.env['RAZORPAY_KEY_SECRET']),
        RAZORPAY_WEBHOOK_SECRET: mask(process.env['RAZORPAY_WEBHOOK_SECRET']),
        RAZORPAY_PLAN_ID: mask(process.env['RAZORPAY_PLAN_ID']),
      },
    },
    'Env loaded - sensitive values masked (first3…last4) for cross-check',
  );
  if (isProd) {
    log.warn({ userId: 'system', route: 'env' }, '▶ RUNNING IN PRODUCTION MODE - live data, real emails, strict CORS');
  }
}

// Printed once after migrations + listen. Gives the exact health URL to curl
// and the API base + auth headers for Postman / mobile, so you never have to
// hunt for the current IP. Set BACKEND_BASE_URL (scheme+host, no path) in .env
// to print the real public URLs; otherwise it falls back to localhost:PORT.
export function logStartupBanner(log: Logger, port: number): void {
  const base = (process.env['BACKEND_BASE_URL'] ?? '').trim().replace(/\/+$/, '');
  const root = base || `http://localhost:${port}`;
  const healthUrl = `${root}/api/health`;
  const apiBase = `${root}/api/v1`;

  // Emitted as discrete, structured lines (not one multi-line ASCII banner) so
  // each stays clean in BOTH local pretty and cloud JSON — a multi-line `msg`
  // would land in CloudWatch as \n-escaped noise. No info dropped vs the banner.
  log.info({ userId: 'system', route: 'server', healthUrl }, `Rai API is up — health check: curl ${healthUrl}`);
  log.info({ userId: 'system', route: 'server', apiBase }, `API base for Postman / mobile / curl: ${apiBase}`);
  log.info({ userId: 'system', route: 'server' }, 'Header 1 (every protected route): Authorization: Bearer <Cognito ID token>');
  log.info({ userId: 'system', route: 'server' }, 'Header 2 (org-scoped routes like /orgs and /projects): X-Org-Id: <org id> — NOT needed for /me or /auth');
  if (base) {
    log.info({ userId: 'system', route: 'server' }, `Also reachable on the box: curl http://localhost:${port}/api/health`);
  } else {
    log.info({ userId: 'system', route: 'server' }, 'Tip: set BACKEND_BASE_URL in .env to print public URLs here (using localhost for now)');
  }
}
