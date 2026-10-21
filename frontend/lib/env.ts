// Central access point for all NEXT_PUBLIC_* config.
//
// IMPORTANT: these are baked into the browser bundle at `next build` time.
// Changing a value needs a REBUILD (docker compose build), not a restart —
// unlike the backend, where editing .env + restart is enough. All reads go
// through here so there's one place to see what the app booted with, plus one
// masked console line to cross-check values after a deploy.

import { logger } from './logger';

// Each var MUST be read as a static `process.env.NEXT_PUBLIC_*` literal —
// Next.js only inlines those into the browser bundle. Dynamic access like
// process.env[key] is NOT replaced and comes back undefined in the browser.
export const ENV = {
  API_URL:        (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000/api/v1').trim(),
  AUTH_PROVIDER:  (process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'custom').trim().toLowerCase(),
  AWS_REGION:     (process.env.NEXT_PUBLIC_COGNITO_REGION ?? '').trim(),
  USER_POOL_ID:   (process.env.NEXT_PUBLIC_COGNITO_POOL_ID ?? '').trim(),
  CLIENT_ID:      (process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '').trim(),
  COGNITO_DOMAIN: (process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '').trim(),
  OAUTH_SIGNIN:   (process.env.NEXT_PUBLIC_OAUTH_SIGNIN_URL ?? 'http://localhost:3000/auth/callback').trim(),
  OAUTH_SIGNOUT:  (process.env.NEXT_PUBLIC_OAUTH_SIGNOUT_URL ?? 'http://localhost:3000/').trim(),
} as const;

// first3…last4 so values can be cross-checked after deploy without full
// exposure (last 4 keeps a trailing port like :3000 fully visible).
function mask(v: string): string {
  if (!v) return '(unset)';
  return v.length <= 8 ? `${v.slice(0, 1)}…(len ${v.length})` : `${v.slice(0, 3)}…${v.slice(-4)}`;
}

let logged = false;
export function logEnvSummary(): void {
  if (logged || typeof window === 'undefined') return;
  logged = true;
  // URLs/region/domain safe in full; pool + client id masked.
  logger.info('env', 'Frontend config (NEXT_PUBLIC, baked at build)', {
    API_URL: ENV.API_URL,
    AUTH_PROVIDER: ENV.AUTH_PROVIDER,
    AWS_REGION: ENV.AWS_REGION,
    COGNITO_DOMAIN: ENV.COGNITO_DOMAIN,
    OAUTH_SIGNIN: ENV.OAUTH_SIGNIN,
    OAUTH_SIGNOUT: ENV.OAUTH_SIGNOUT,
    USER_POOL_ID: mask(ENV.USER_POOL_ID),
    CLIENT_ID: mask(ENV.CLIENT_ID),
  });
}
