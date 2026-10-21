import pino from 'pino';
import { isDev } from './env';
import { getReqId } from './requestContext';

const levelMap: Record<number, string> = {
  10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL',
};

// ANSI colors — applied ONLY to the level word in local dev. Everything else
// stays the terminal's default color (deliberate: color is a signal for log
// type, not decoration).
const LEVEL_COLOR: Record<string, string> = {
  TRACE: '\x1b[90m', DEBUG: '\x1b[36m', INFO: '\x1b[32m',
  WARN: '\x1b[33m', ERROR: '\x1b[31m', FATAL: '\x1b[35m',
};
const RESET = '\x1b[0m';

// Human-readable IST timestamp "YYYY-MM-DD HH:MM:SS". Formatted in Asia/Kolkata
// via Intl (NOT process.env.TZ) so the rest of the app's Date handling is
// untouched. CloudWatch keeps its own UTC @timestamp for sorting; this field is
// for humans reading the line.
function istStamp(ts?: number): string {
  const d = ts ? new Date(ts) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p['year']}-${p['month']}-${p['day']} ${p['hour']}:${p['minute']}:${p['second']}`;
}

// pino-pretty is only used in dev — and only if installed. A missing transport
// must degrade to plain JSON, never crash the process on boot.
function prettyAvailable(): boolean {
  if (!isDev) return false;
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const usePretty = prettyAvailable();

// Auto-attach the request id (from AsyncLocalStorage) to EVERY log line, so no
// controller has to pass it. Empty when outside a request (e.g. boot logs).
function mixin() {
  const reqId = getReqId();
  return reqId !== undefined ? { reqId } : {};
}

// ── Development: in-process pino-pretty stream ────────────────────────────────
//   [2026-06-05 18:07:48 IST] INFO: <userId> | POST /tickets | reqId: 1042 | <msg> {ctx}
//   Used as a direct stream (not a transport worker) so we can pass FUNCTION
//   prettifiers — functions can't cross the worker-thread boundary.
function devStream() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pretty = require('pino-pretty');
  return pretty({
    colorize: false,                 // we color ONLY the level ourselves (below)
    singleLine: true,
    translateTime: false,            // time formatted by our customPrettifier
    // Keep `err`/`error` inline in the single-line tail instead of pino-pretty
    // breaking them onto their own block. pino-pretty folds pino's own errorKey
    // into this set, so we ALSO set errorKey on the pino instance below.
    errorLikeObjectKeys: ['__none__'],
    ignore: 'pid,hostname,userId,route,method,reqId',
    // Build the prefix conditionally so non-request logs (boot, shutdown, cron)
    // don't render empty "| | reqId: |" scaffolding.
    messageFormat: (log: Record<string, unknown>, messageKey: string) => {
      const parts: string[] = [];
      if (log['userId']) parts.push(String(log['userId']));
      if (log['method'] || log['route']) parts.push(`${log['method'] ?? ''} ${log['route'] ?? ''}`.trim());
      if (log['reqId'] !== undefined) parts.push(`reqId: ${log['reqId']}`);
      const prefix = parts.length ? `${parts.join(' | ')} | ` : '';
      return `${prefix}${log[messageKey] ?? ''}`;
    },
    customPrettifiers: {
      time: (ts: number) => `[${istStamp(ts)} IST]`,
      level: (lvl: number | string) => {
        const label = typeof lvl === 'number' ? (levelMap[lvl] ?? String(lvl)) : String(lvl);
        return `${LEVEL_COLOR[label] ?? ''}${label}${RESET}`;
      },
    },
  });
}

// ── Production: clean single-line JSON for CloudWatch (awslogs ships it as-is) ─
//   {"level":"INFO","time":"2026-06-05 18:07:48 IST","reqId":1042,"userId":"…",
//    "method":"POST","route":"/tickets","msg":"…",…ctx}
const logger = usePretty
  ? pino({ level: process.env['LOG_LEVEL'] ?? 'info', mixin, errorKey: '__none__' }, devStream())
  : pino({
      level: process.env['LOG_LEVEL'] ?? 'info',
      mixin,
      timestamp: () => `,"time":"${istStamp()} IST"`,
      formatters: {
        level: (label: string, number: number) => ({ level: levelMap[number] ?? label.toUpperCase() }),
        bindings: () => ({}), // strip pid + hostname
      },
    });

export default logger;
