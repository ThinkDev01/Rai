# Guide — Logging & CloudWatch

What our logs look like, how local and AWS differ, and how to read/filter them in CloudWatch. Beginner-friendly.

> **How it's built** (logger config, reqId/AsyncLocalStorage, awslogs driver) → `../Guide/dev-standards.md` § 6 Observability.

## Golden rule
Log **every meaningful step** — handler entry, validation pass/fail, branch decisions, success, errors. Sparse logs turn a bug report into a guessing game. Write `msg` like a human sentence, not a code.

## Local vs Cloud — same logs, two renders
Switched by `ENVIRONMENT`. Times are **IST**.

| | Local (dev) | Cloud (prod) |
|---|---|---|
| Shape | pretty, single line | clean JSON, one object per line |
| Color | only the level word | none |
| Where | terminal (`npm run dev`) | CloudWatch (via the awslogs driver) |

**Local:**
```
[2026-06-05 18:19:00 IST] INFO: 0190f8e2-… | POST /api/v1/tickets | reqId: 1042 | Saved the new ticket to the database {"ticketId":42}
```
**Cloud (`@message`):**
```json
{"level":"INFO","time":"2026-06-05 18:19:00 IST","reqId":1042,"userId":"0190f8e2-…","method":"POST","route":"/api/v1/tickets","msg":"Saved the new ticket to the database","ticketId":42}
```

> Cloud JSON requires `ENVIRONMENT=prod`; otherwise the dev pretty-printer leaks ANSI color codes (`[32m…`) into CloudWatch.
> **Frontend** uses the same format (keyed by `component`, no reqId); client-side logs live in the **user's browser**, not CloudWatch. See `../frontend/guide - logging.md`.

## Fields
| Field | Meaning |
|---|---|
| `level` | INFO / WARN / ERROR (also TRACE / DEBUG / FATAL) |
| `time` | IST timestamp (CloudWatch also keeps its own UTC `@timestamp` for sorting) |
| `reqId` | per-request id — every line of one request shares it |
| `userId` | who did it (or `system` / `anonymous`) |
| `route` + `method` | which endpoint |
| `msg` | the human message |
| extras | `orgId`, `projectId`, `ticketId`, `err`, `status`, … |

## reqId — trace one request
Every line of a single HTTP request carries the same `reqId`. Filtering by it gives that request's full sequence in order, even when many requests interleave — the fix for "a step looks missing" (it's just interleaved, not gone). Per request, not per user/ticket; resets on restart.

## Reading logs in CloudWatch
Two tools: **Logs Insights** (query language — use this) and **Log group search** (quick text filter). Set the timezone toggle to **Local** to read times in IST.

### Logs Insights (recommended)
Console → CloudWatch → **Logs Insights** → pick the log group → set the time range → **Run**. Because logs are JSON, every field is queryable.

- **Trace one request (go-to):**
  ```
  fields @timestamp, level, route, msg
  | filter reqId = 1042
  | sort @timestamp asc
  ```
- **All errors, newest first:** `filter level = "ERROR" | sort @timestamp desc | limit 50`
- **One user, in order:** `filter userId = "0190f8e2-…" | sort @timestamp asc`
- **One endpoint:** `filter route = "/api/v1/projects" and method = "POST"`
- **One org:** `filter orgId = "0190f7a1-…"`
- **Errors by route:** `filter level = "ERROR" | stats count(*) as n by route | sort n desc`
- **Free text:** `filter @message like /timeout/`
- **Logs after a known line:** find its `@timestamp`, set the range **start** to it, drop the keyword, `sort @timestamp asc` — read forward from there.

### Quick filter (no query language)
Console → **Log groups** → pick the group → **Search log group**. JSON patterns:
- `{ $.level = "ERROR" }`
- `{ $.reqId = 1042 }`
- `{ $.userId = "0190f8e2-…" }`
- plain text: just type a word

### Essentials
- **Time-range picker** (top-right) is your biggest filter — narrow it first (queries get faster + cheaper).
- `sort @timestamp asc` = replay in order; `desc` = newest first.
- `=` exact match; `like /…/` partial/regex. Chain with `and`.
- `stats count(*) by <field>` = aggregate (errors per route, hits per user).
- **Save** queries you run often (Insights → *Save*).
