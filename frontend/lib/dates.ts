const IST: Intl.DateTimeFormatOptions['timeZone'] = 'Asia/Kolkata';

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: IST,
});

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: IST,
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: IST,
});

// en-CA renders as YYYY-MM-DD, exactly what <input type="date"> expects.
const dateInputFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: IST,
});

/** "14 Apr 2026" - for sprint dates, last-active, etc. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try { return dateFmt.format(new Date(iso)); } catch { return iso; }
}

/**
 * "2026-04-14" in IST - for <input type="date"> values.
 * The API returns DATE columns as UTC timestamps (e.g. "...T18:30:00.000Z"),
 * so a naive `.slice(0, 10)` pulls the day back one under IST. Formatting in
 * IST keeps the input in sync with what `formatDate` shows on screen.
 */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  try { return dateInputFmt.format(new Date(iso)); } catch { return ''; }
}

/** "14 Apr 2026, 10:00 pm IST" - for createdAt / updatedAt / comment timestamps */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try { return dateTimeFmt.format(new Date(iso)) + ' IST'; } catch { return iso; }
}

/** "10:00 pm" - time-only slice of a timestamp (used in narrow attachment tiles). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try { return timeFmt.format(new Date(iso)); } catch { return iso; }
}
