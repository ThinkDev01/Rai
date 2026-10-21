# convo-065 — Mobile push (FCM) — backend build

**TL;DR**
- Built the **whole backend side of mobile push** (FCM): `device_tokens` table (migration 018), `push` module (`POST`/`DELETE /api/v1/devices`), a **real** `push.channel` (firebase-admin multicast + dead-token prune), and `config/firebase.ts` (lazy init from one env var).
- **Safe by default:** push is a silent no-op until `FIREBASE_SERVICE_ACCOUNT` is set — backend boots/runs normally; in-app + email unaffected. Push now mirrors the in-app bell row on every notification.
- Code is done + type-checks clean. **Next (pre-prod):** create the Firebase project → set `FIREBASE_SERVICE_ACCOUNT` → hand the mobile dev the project + endpoint contracts. Tracked in `upgrades.md` go-live checklist.

---

## Context
Per the v2 split, the **mobile app is built by a separate dev** — backend owns only the **send side** of push. This session made the long-stubbed push channel real so the only remaining work is a Firebase credential + the mobile client.

## What we discussed (decisions)
- **FCM via `firebase-admin`** is the standard, minimal, free route. Rejected AWS SNS mobile push (still sits on top of FCM/APNs — more plumbing, no less Firebase) and OneSignal/Expo (not needed).
- **How delivery works:** backend calls FCM *outbound*; Google/Apple push to the device; the **mobile app** receives + renders. We do **not** expose a webhook/API to the phone for delivery — the only API we expose is device register/unregister.
- **One env var** holds the credential (`FIREBASE_SERVICE_ACCOUNT`, base64 of the service-account JSON). Optional like `SES_FROM_EMAIL` — unset = push disabled.
- **Push mirrors in-app:** fires for every dispatched notification (not gated by email prefs); carries `data.{type,link,orgSlug}` for deep-linking. Per-type push opt-out is a later refinement.

## What shipped (backend code)
| File | Change |
|---|---|
| `config/migrations/018_device_tokens.sql` | `device_tokens` — `id`, `user_id` (FK, ON DELETE CASCADE), `token` (UNIQUE), `platform`, `created_at`, `last_seen_at`; index on `user_id`. |
| `config/firebase.ts` | Lazy `firebase-admin` singleton. Loads creds from `FIREBASE_SERVICE_ACCOUNT` (base64 or raw JSON). Bad/missing cred → logs + disables push, never fatal. Exposes `getMessaging()` / `isPushEnabled()`. |
| `modules/push/push.model.ts` | `upsertToken` (ON CONFLICT(token) → move + bump `last_seen_at`), `deleteToken`, `listTokensForUser`, `deleteTokens` (bulk prune). |
| `modules/push/push.controller.ts` | `registerDevice` (validates token len + platform in `ios`/`android`/`web`), `unregisterDevice`. |
| `modules/push/push.routes.ts` | `POST /` + `DELETE /` under `authMiddleware` (user-scoped, no org). |
| `notifications/channels/push.channel.ts` | **Stub → real.** Get tokens → `sendEachForMulticast` (notification + data + android high-priority + apns sound) → prune tokens FCM reports dead (`registration-token-not-registered` / `invalid-*`). Best-effort: never throws. |
| `notifications/notifications.service.ts` | Resolves org slug once (email URL + push deep-link); calls `deliverPush({title,body,link,orgSlug})`. |
| `notifications/notifications.types.ts` | Added optional `pushTitle` / `pushBody` to `RenderedNotification` (fallback: title `'Rai'`, body = `inappText`). |
| `app.ts` | Mounted `pushRoutes` at `/api/v1/devices`. |
| `config/env.ts`, `.env.example` | `FIREBASE_SERVICE_ACCOUNT` (optional) added to summary + template. |
| `package.json` | `firebase-admin@^13` added + installed. |

## Endpoints
- `POST /api/v1/devices` `{ token, platform }` — register/refresh (app: on login + token refresh).
- `DELETE /api/v1/devices` `{ token }` — unregister (app: on logout).
- Both user-scoped, no `X-Org-Id`. Docs: `Api-Documentation/devices-api/`.

## Verification
- `npm run build` clean for all push/firebase/notifications files. (Only pre-existing `tsc` errors are in the in-progress `modules/billing/razorpay.provider.ts` — not this work.)
- Tests DB-gated (no local Postgres up → 30 skipped); new endpoints not yet covered.

## What's left — PRE-PROD (not backend code)
1. **Firebase Console** → create project → Cloud Messaging (on by default).
2. **Project settings → Service accounts → Generate new private key** → JSON.
3. Base64 it → backend env `FIREBASE_SERVICE_ACCOUNT`. PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))`.
4. Restart backend → boot log: `Firebase Admin initialised - mobile push enabled`.
5. Credential under **`devops@novetum.com`** (dev/infra account).
6. **Hand the mobile dev** (see below).

### Mobile-dev handoff (what to tell them)
- **Firebase project:** here's the project — pull your app config from it (`google-services.json` for Android, `GoogleService-Info.plist` for iOS) so client tokens + server creds are one project.
- **Register on login + every FCM token refresh:** `POST /api/v1/devices` with `{ token: <fcm-token>, platform: "ios"|"android"|"web" }` + `Authorization: Bearer <id token>`. No org header.
- **Unregister on logout:** `DELETE /api/v1/devices` with `{ token }`.
- **Payload they'll receive:** `notification.{title,body}` + `data.{type, link, orgSlug}` — use `orgSlug` + `link` to deep-link into the right org/screen. (Uninstalled tokens self-prune server-side; no cleanup needed on their end.)

## Setup runbook (full chain, in order — staging + prod identical)
For whoever sets it up end-to-end (here the user is doing both backend env + mobile client):

**Firebase (once)**
- Create a Firebase project (or reuse). Cloud Messaging is auto-enabled.
- Project settings → Service accounts → **Generate new private key** → download JSON.

**Backend env (each env)**
- Base64 the JSON: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))`.
- Set `FIREBASE_SERVICE_ACCOUNT=<base64>` in backend `.env`.
- Restart backend (mounted `.env`, **no rebuild**) → log: `Firebase Admin initialised - mobile push enabled`.
- `npm run migrate` so `device_tokens` exists (prod too).

**Mobile app**
- Add the same project's config (`google-services.json` / `GoogleService-Info.plist`).
- Get FCM token → `POST /api/v1/devices {token, platform}` on login + refresh; `DELETE` on logout.
- On receive → deep-link via `data.{type, link, orgSlug}`.

**Prod gotchas**
- Backend env is mounted → edit + restart, no rebuild.
- Same Firebase project across envs (or one per env — match cred ↔ app config).
- **iOS only:** upload the **APNs auth key** in Firebase → Cloud Messaging (Android needs nothing).
- Blank `FIREBASE_SERVICE_ACCOUNT` = push silently off; in-app + email unaffected — safe.

## Docs updated this session
`guide - db.md`, `guide - backend.md`, `Api-Documentation/devices-api/` + README, `dev-notifications.md` (Mobile push (FCM) section + Firebase setup + env var), `dev-deployment.md` (one-time AWS/Firebase setup), `v2-plans.md` (Phase 3 push ✅), `upgrades.md` (go-live row + FCM section + manage-devices table rename).
