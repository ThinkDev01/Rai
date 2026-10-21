# convo-067 — CI/CD test failure fix: lazy Cognito init + buildspec/env clarity

**TL;DR**
- CodeBuild was failing at the test step because `cognito-auth.service.ts` validated Cognito env + built its clients **at module load** — so merely *importing* the file threw `Cognito env not configured`, even though the test suite mocks auth.
- **Fix:** moved env check + client construction into the `CognitoAuthService` **constructor**, making the import side-effect-free. The factory (`auth.factory.ts`) is lazy, so the real provider is only built on first runtime use; tests inject `MockAuthService` and never need Cognito env.
- Verified locally: `tsc` clean, **36/36 tests pass** with DB-only env (no Cognito/AWS). Committed `168c760` and pushed to `main`.
- **Decision:** do **NOT** add the Cognito vars DevOps proposed to the buildspec `.env.test` block — tests mock auth, so those vars do nothing. Tests need DB env only.
- **Open item:** `scripts/deploy_container.sh` has mismatched region fallbacks — `AWS_DEFAULT_REGION` defaults to `ap-south-1` but `AWSLOGS_REGION` defaults to `ap-south-2`. Likely a typo; confirm with DevOps and align.

---

## Context

DevOps asked us to add a block to `backend/buildspec.yml` that creates `.env.test` and appends Cognito config:

```bash
cp .env.test.example .env.test
cat >> .env.test <<EOF
AWS_REGION=$AWS_DEFAULT_REGION
COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
COGNITO_APP_CLIENT_ID=$COGNITO_APP_CLIENT_ID
EOF
```

The real question behind it: the CI build was **failing at the test stage**, and it wasn't clear what env the test suite actually requires.

## Root cause

- **Why it only broke in CI:** locally a real `.env` (with Cognito vars) existed, so the top-of-file Cognito check passed by luck. In CI there is no `.env` — only `.env.test` (DB-only) — so the old module-load check threw and killed the build.
- **The real bug:** `cognito-auth.service.ts` ran env validation + `CognitoJwtVerifier.create()` + `new CognitoIdentityProviderClient()` at the **top level**. Importing the file (which the route tree does) triggered all of it, regardless of whether the real provider was ever used.
- **Tests don't need Cognito:** `tests/v2-api.test.ts` does `import './mock-auth'`, which swaps in `MockAuthService` via `setAuthService()`. No real Cognito call ever happens. `validateEnv()` (the REQUIRED-vars gate in `config/env.ts`) is only called from `server.ts`, which tests do not import.

## What shipped

### Backend — `modules/auth/cognito-auth.service.ts`

| Before | After |
|--------|-------|
| `region` / `userPoolId` / `clientId` read + validated at module top level; `verifier` + `cognito` client built as module-level consts. | All of it moved **into the `CognitoAuthService` constructor** as private fields (`this.userPoolId`, `this.verifier`, `this.cognito`). Importing the file is now side-effect-free. |

- Method bodies updated to use `this.verifier` / `this.cognito` / `this.userPoolId`.
- `auth.factory.ts` confirmed lazy: `getAuthService()` only does `new CognitoAuthService()` on first call; `setAuthService()` lets tests inject the mock first. The old failure mode cannot return.

### Verification (local)

- `npm run build` (tsc) → clean.
- Started throwaway Postgres 16 container, `cp .env.test.example .env.test`.
- `npx vitest run tests/v2-api.test.ts` → **36/36 passed** with **no Cognito/AWS env at all**.
- Cleaned up the test container; `.env.test` confirmed gitignored.

### Commit

- `168c760 Fix: lazy Cognito init so importing auth is side-effect-free (tests need no Cognito env)` — pushed to `main`. Backend-only change (one file). Frontend unaffected.

## Decisions

- **Buildspec:** leave it as-is. Do **not** append `AWS_REGION` / `COGNITO_USER_POOL_ID` / `COGNITO_APP_CLIENT_ID` to `.env.test`. The suite mocks auth, so those vars are dead weight. Only worth adding if/when real-Cognito integration tests (no mock) are introduced.
- **Env needed for testing:** DB only — `DB_HOST/PORT/USER/PASSWORD/NAME` from `.env.test` (DB_HOST must be local per the safety guard in `tests/setup.ts`).
- **Env safe to ignore in testing:** `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `CORS_ORIGIN`, Razorpay, Firebase. (These are still REQUIRED at real server startup via `validateEnv()` — just not for tests.)

## Reference — pipeline shape (from buildspec.yml / deploy_container.sh)

```
GitHub → CodePipeline → CodeBuild (buildspec.yml → image → ECR)
       → CodeDeploy (appspec.yml → scripts/deploy_container.sh) → EC2 (Docker + host Nginx)
```

- **CodeBuild test stage:** `npm ci` → `npm run build` (tsc) → create `.env.test` → start Postgres container → `vitest run tests/v2-api.test.ts` → `npm audit` → docker build → Trivy scan → push to ECR. Any step fails → build dies, bad image never ships.
- **CodeDeploy (`deploy_container.sh`):** ECR login → pull image → stop/remove old container → `docker run` new one with mounted runtime `.env` (`/opt/rai/backend/.env`, read-only) + `awslogs` CloudWatch driver + `--restart unless-stopped` → poll `/api/health` for success/fail signal → prune old image layers.

## Open items / next

- **Region fallback mismatch** in `scripts/deploy_container.sh`: `AWS_DEFAULT_REGION:-ap-south-1` (Mumbai) vs `AWSLOGS_REGION:-ap-south-2` (Hyderabad). These are `${VAR:-default}` fallbacks (DevOps' env wins normally), but if `AWSLOGS_REGION` is unset, logs land in a different region than ECR/everything else. Confirm intended region and fix the fallback (one-line change, not yet applied).
