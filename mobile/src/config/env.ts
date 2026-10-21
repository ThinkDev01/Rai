/**
 * Central app config — read EXCLUSIVELY from `.env` via react-native-dotenv
 * (the `@env` module). `.env` is the single source of truth.
 *
 * There are NO hardcoded URLs / regions / IDs anywhere in the codebase — every
 * environment-specific value lives in `.env` only, so deploying to a new
 * environment is just: edit `.env` → rebuild. All values are CLIENT config
 * (public by design — the web app bakes the same ones into its browser bundle).
 *
 * NOTE: changing `.env` requires restarting Metro with `--reset-cache` so the
 * babel transform re-reads the file.
 */
import {
  API_URL as ENV_API_URL,
  AWS_REGION as ENV_AWS_REGION,
  COGNITO_USER_POOL_ID,
  COGNITO_APP_CLIENT_ID,
  COGNITO_DOMAIN as ENV_COGNITO_DOMAIN,
  OAUTH_REDIRECT_URL,
  DEEPLINK_SCHEME as ENV_DEEPLINK_SCHEME,
  WEB_HOST as ENV_WEB_HOST,
} from '@env';

// Trim only — no hardcoded fallbacks. Missing values surface as empty strings
// and are reported by the dev-time check below, never silently defaulted to a
// real URL/region that could mask a misconfigured deploy.
const read = (v: string | undefined): string => (v ?? '').trim();

export const ENV = {
  // Backend API base (includes /api/v1, no trailing slash).
  API_URL: read(ENV_API_URL),

  // AWS Cognito (public app-client config).
  AWS_REGION: read(ENV_AWS_REGION),
  USER_POOL_ID: read(COGNITO_USER_POOL_ID),
  CLIENT_ID: read(COGNITO_APP_CLIENT_ID),
  COGNITO_DOMAIN: read(ENV_COGNITO_DOMAIN),

  // OAuth redirect (deep link) for federated sign-in.
  OAUTH_REDIRECT: read(OAUTH_REDIRECT_URL),
  DEEPLINK_SCHEME: read(ENV_DEEPLINK_SCHEME),

  // Web frontend host (no trailing slash, no protocol) — e.g. rai-staging.novetum.com
  WEB_HOST: read(ENV_WEB_HOST),
} as const;

/** True when Cognito federation (Hosted UI) is configured. */
export const isFederationConfigured = Boolean(ENV.COGNITO_DOMAIN);

/** True when the minimum native-auth config is present. */
export const isCognitoConfigured = Boolean(
  ENV.AWS_REGION && ENV.USER_POOL_ID && ENV.CLIENT_ID,
);

// Dev-time guard: loudly warn if any required `.env` value is missing, instead
// of silently falling back to a hardcoded default.
if (__DEV__) {
  const required: (keyof typeof ENV)[] = ['API_URL', 'AWS_REGION', 'USER_POOL_ID', 'CLIENT_ID'];
  const missing = required.filter(k => !ENV[k]);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Missing required .env values: ${missing.join(', ')}. ` +
        `Set them in .env and restart Metro with --reset-cache.`,
    );
  }
}
