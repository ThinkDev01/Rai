/**
 * Frontend logger.
 *
 * Two very different destinations, so two very different renderings:
 *
 *   - SERVER-side (Server Components / route handlers / middleware) → terminal /
 *     Docker stdout. Structured like the backend (IST, JSON in prod) so it's
 *     greppable. NOTE: the frontend does NOT ship to CloudWatch — backend is the
 *     only CloudWatch source. These server logs just land in `docker logs`.
 *
 *   - CLIENT-side ('use client') → the user's browser console. Kept LEAN: the
 *     browser devtools already give you the timestamp (Settings → Show
 *     timestamps), the level color (we use the native console.info/warn/error),
 *     the source file:line, and expandable objects. So we print just
 *     `Component — message` and pass the data as a real object (inspect it in
 *     devtools — no JSON string). No manual time, no per-line userId.
 *
 * Level rules (both sides):
 *   - error → always
 *   - info/warn → server: always; client: dev only (don't spam/leak in the
 *     user's browser in prod)
 *
 * Identified by `component`. Never log tokens, passwords, or full response bodies.
 */

const isServer = typeof window === 'undefined';
const isDev = process.env.NODE_ENV === 'development';

type Level = 'INFO' | 'WARN' | 'ERROR';
type LogData = Record<string, unknown>;

// ── Server rendering (structured) ────────────────────────────────────────────
const LEVEL_COLOR: Record<Level, string> = {
  INFO: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m',
};
const RESET = '\x1b[0m';

// IST "YYYY-MM-DD HH:MM:SS" via Intl (Asia/Kolkata), matching the backend.
function istStamp(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p['year']}-${p['month']}-${p['day']} ${p['hour']}:${p['minute']}:${p['second']}`;
}

function emitServer(level: Level, component: string, msg: string, data?: LogData): void {
  const { userId = 'anonymous', ...rest } = data ?? {};
  // Prod → clean JSON line; dev → pretty, level word colored.
  if (!isDev) {
    const entry = { level, time: `${istStamp()} IST`, userId: String(userId), component, msg, ...rest };
    const out = JSON.stringify(entry);
    if (level === 'ERROR') console.error(out);
    else console.log(out);
    return;
  }
  const lvl = `${LEVEL_COLOR[level]}${level}${RESET}`;
  const tail = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  const line = `[${istStamp()} IST] ${lvl}: ${userId} | ${component} | ${msg}${tail}`;
  if (level === 'ERROR') console.error(line);
  else console.log(line);
}

// ── Client rendering (lean — let devtools do the work) ───────────────────────
function emitClient(level: Level, component: string, msg: string, data?: LogData): void {
  // No message → the component IS the whole label (e.g. the API request trace
  // builds its own "API → GET /me" line and passes msg = ''). Avoids a dangling
  // "— " separator. Normal logs keep the "Component — message" shape.
  const label = msg ? `${component} — ${msg}` : component;
  const fn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.info;
  if (data && Object.keys(data).length > 0) fn(label, data);  // object stays expandable
  else fn(label);
}

function emit(level: Level, component: string, msg: string, data?: LogData): void {
  if (isServer) emitServer(level, component, msg, data);
  else emitClient(level, component, msg, data);
}

export const logger = {
  /**
   * General info — API calls, state updates, lifecycle events.
   * Server: always. Client: dev only.
   * Usage: logger.info('LoginPage', 'Submitting credentials to Cognito', { email })
   */
  info: (component: string, msg: string, data?: LogData): void => {
    if (!isServer && !isDev) return;
    emit('INFO', component, msg, data);
  },

  /**
   * Warnings — non-critical issues worth noting.
   * Server: always. Client: dev only.
   */
  warn: (component: string, msg: string, data?: LogData): void => {
    if (!isServer && !isDev) return;
    emit('WARN', component, msg, data);
  },

  /**
   * Errors — always logged, everywhere.
   * Never include tokens, passwords, or full response bodies.
   * Usage: logger.error('LoginPage', 'Login failed', { userId, status: 401 })
   */
  error: (component: string, msg: string, data?: LogData): void => {
    emit('ERROR', component, msg, data);
  },
};
