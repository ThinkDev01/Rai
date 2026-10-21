// Date formatting — ported from web lib/dates.ts. IST (Asia/Kolkata) to match web.

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
};

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
};

export function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  try {
    return new Intl.DateTimeFormat('en-GB', DATE_OPTS).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  try {
    return new Intl.DateTimeFormat('en-GB', TIME_OPTS).format(d) + ' IST';
  } catch {
    return d.toLocaleString();
  }
}

/** Short relative time: "just now", "5m ago", "2h ago", "Yesterday", date. */
export function timeAgo(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 172_800_000) return 'Yesterday';
  return formatDate(iso);
}

/** Relative-ish short label for "last active". */
export function formatRelative(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const diff = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diff < day) return 'Today';
  if (diff < 2 * day) return 'Yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return formatDate(iso);
}

/** ISO date helpers (YYYY-MM-DD), local-midnight safe (no UTC shift). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
