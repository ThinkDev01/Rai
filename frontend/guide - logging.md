# Guide — Frontend Logging

How the frontend logs and where each line goes (browser vs terminal). Beginner-friendly.

> **The frontend does NOT use CloudWatch.** Client logs live in the user's browser; backend is the single CloudWatch source. **How it's built** → `../Guide/dev-standards.md` § 6 Observability.

## Golden rule
Log **every meaningful step** — page/route hit, API calls (logged automatically before they fire — see below), branch decisions, success, errors. Write `msg` like a human sentence, not a code. Never log tokens, passwords, or full response bodies.

## Two renderings — by where the code runs
Frontend code runs in two places, and we log very differently in each:

| Code | Lands in | Rendering |
|---|---|---|
| **Client** (`'use client'`) | the user's **browser console** (F12) | **lean** — `Component — message` + an expandable object |
| **Server** (Server Component / route handler / middleware) | terminal / `docker logs` | **structured** — IST, level-colored in dev, JSON in prod (same as backend) |

### Where to look — browser console vs terminal
The split is strict — a log lands in exactly one place, never both:

- **Client logs → the browser console only** (devtools → Console). They do **not** show up in your `npm run dev` terminal.
- **Server logs → the terminal / `docker logs` only** (Server Components, route handlers, middleware).
- **Why client logs aren't mirrored to the terminal:** Next 16 forwards the browser console to the terminal by default, but to do that it wraps `console` — which reattributes **every** line's source to `forward-logs-shared.ts` instead of the real file. Since we read client logs in the browser, we turn the forwarding off (`browserToTerminal: false` in `next.config.ts`), restoring correct `file:line` links. (It does **not** silence Next's own `[Fast Refresh]` HMR lines — those are react-refresh, dev-only, no config switch.)
- **No CloudWatch for the frontend.** Client logs live in the user's browser; server-render logs go to `docker logs`. The **backend is the only CloudWatch source** (see `../backend/guide - logging.md`).

### Client — lean (let devtools do the work)
We deliberately DON'T print a timestamp, userId, or a JSON string on the client. Browser devtools already give you:
- the **time** (Settings → *Show timestamps*),
- the **level** color (we call the native `console.info` / `console.warn` / `console.error`),
- the **source** file:line link,
- an **expandable object** (we pass the data object directly — inspect it, no flat string).

So a client line is just:
```
LoginPage — Submitting credentials to Cognito      ▸ { email: "jane@acme.com" }
```

### Server — structured
```
[2026-06-05 18:19:00 IST] INFO: 0190f8e2-… | LoginPage | <msg> {"…":"…"}     (dev)
{"level":"INFO","time":"2026-06-05 18:19:00 IST","userId":"…","component":"LoginPage","msg":"…"}   (prod)
```

## Level rules
- **`error`** → always logged (server + client, dev + prod).
- **`info` / `warn`** → **server: always**; **client: dev only** (suppressed in prod so we don't spam or leak in the user's browser).

## How to write a log (same API both sides)
```ts
logger.info('LoginPage', 'Submitting credentials to Cognito', { email });
logger.warn('AuthProvider', 'Access token near expiry — refreshing in background');
logger.error('LoginPage', 'Login failed', { userId, status: 401 });
```
Keyed by **`component`**. Write `msg` like a human sentence. Pass context as an object — on the client it stays inspectable; on the server it's folded into the structured line.

## Automatic logs (you don't write these)
- **API requests** — the axios request interceptor (`lib/api.ts`) emits one lean line per outgoing call, just before it fires:
  ```
  API → GET  /projects/33     ▸ { url: "…/api/v1/projects/33", orgId: "…" }
  API → POST /tickets         ▸ { url: "…/api/v1/tickets", orgId: "…", body: { title: "…", … } }
  ```
  Method + path in the message; full URL + org context in the object. **POST/PUT/PATCH** also include the request `body` (GET/DELETE have none) with secrets masked (`password`/`token`/`otp`/… → `***`, see `redactBody`). Confirms request timing + payload at a glance. Dev-only on the client.
- **Page views** — `usePageView(page, msg, details)` logs one "page opened" line per page mount. Drop it at the top of a page component; don't log mounts by hand.

## Avoiding duplicate lines (dev StrictMode)
`reactStrictMode` is **on** (it catches real effect-cleanup bugs), so React double-invokes mount effects in dev (mount → cleanup → mount). A naked `useEffect(() => log(), [])` therefore prints **twice** in dev (once in prod). Guard one-shot mount logs with a ref so they fire once:
```ts
const logged = useRef(false);
useEffect(() => {
  if (logged.current) return;
  logged.current = true;
  logger.info('SomePage', 'Page opened');
}, []);
```
`usePageView` already does this. API logs don't need it — React Query dedupes the fetches.
