'use client';

import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { Calendar, ChevronLeft, ChevronRight } from '@/lib/icons';
import 'react-day-picker/style.css';

// Custom date picker. Replaces native <input type="date"> which has browser-
// dependent quirks (month/year selector requires double-click, some months
// silently fail to select on Firefox + certain Chromium builds). DayPicker
// gives us a controlled, predictable popover calendar that behaves the same
// across every browser.
//
// API mirrors the native input minimally - value is an ISO date string
// "YYYY-MM-DD", onChange emits the same. Caller doesn't deal with Date
// objects; we parse/serialize at the boundary.

interface Props {
  value:        string;                    // ISO YYYY-MM-DD, or empty
  onChange:     (value: string) => void;
  label?:       string;
  placeholder?: string;
  min?:         string;                    // ISO date - dates before this disabled
  max?:         string;                    // ISO date - dates after this disabled
  required?:    boolean;
  disabled?:    boolean;
}

// ISO date helpers. Browser's `Date(string)` interpretation varies (UTC vs
// local) - we work in pure YYYY-MM-DD strings and a "local midnight" Date
// object for the calendar only, never serializing through Date.toISOString().
function toIsoDate(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseIsoDate(s: string): Date | undefined {
  if (!s) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return undefined;
  const [, y, m, d] = match;
  // Local midnight - matches what DayPicker expects.
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function formatDisplay(d: Date | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = 'Pick a date',
  min,
  max,
  required,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = parseIsoDate(value);
  const minDate  = min ? parseIsoDate(min) : undefined;
  const maxDate  = max ? parseIsoDate(max) : undefined;

  // Controlled visible month - explicit so the calendar ALWAYS opens on
  // today's month (or the selected date's month) every time the popover
  // opens, regardless of any react-day-picker default-month quirks with
  // captionLayout='dropdown' + undefined startMonth bounds.
  // We always normalize to the first of the month so the day-of-month
  // doesn't accidentally roll month over during timezone math.
  function todayMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  function monthStart(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  const [month, setMonth] = useState<Date>(() => selected ? monthStart(selected) : todayMonthStart());

  // Snap visible month back to today / selected whenever the popover opens.
  // Without this, the calendar can stick on whatever month the user last
  // navigated to (or, on first mount when value=='', show whatever DayPicker's
  // own default-month resolution decides - which has been observed to drift
  // a month back).
  useEffect(() => {
    if (open) {
      setMonth(selected ? monthStart(selected) : todayMonthStart());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sensible navigation bounds when caller hasn't pinned min/max. Without
  // these, the year dropdown was sparse/empty with captionLayout='dropdown'.
  const navStart = minDate ?? new Date(new Date().getFullYear() - 5, 0, 1);
  const navEnd   = maxDate ?? new Date(new Date().getFullYear() + 5, 11, 31);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      <div className="relative" ref={wrapperRef}>
        <button
          type="button"
          onClick={() => !disabled && setOpen(v => !v)}
          disabled={disabled}
          className={`flex w-full items-center justify-between gap-2 rounded border bg-surface-raised px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60 ${
            selected ? 'border-border text-text' : 'border-border text-text-placeholder'
          }`}
        >
          <span className="truncate">
            {selected ? formatDisplay(selected) : placeholder}
          </span>
          <Calendar size={14} className="flex-shrink-0 text-text-placeholder" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-border bg-surface-raised p-2 shadow-xl">
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (!d) return;
                onChange(toIsoDate(d));
                setOpen(false);
              }}
              month={month}
              onMonthChange={setMonth}
              captionLayout="dropdown"
              startMonth={navStart}
              endMonth={navEnd}
              today={new Date()}
              disabled={[
                ...(minDate ? [{ before: minDate }] : []),
                ...(maxDate ? [{ after:  maxDate }] : []),
              ]}
              showOutsideDays
              classNames={{
                root:           'rdp-rai',
                months:         'flex flex-col',
                month:          'space-y-2',
                month_caption:  'flex items-center justify-center gap-2 pb-2',
                dropdowns:      'flex items-center gap-1.5',
                dropdown_root:  'relative inline-block',
                dropdown:       'cursor-pointer rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text outline-none focus:border-primary',
                caption_label:  'sr-only',
                nav:            'absolute inset-x-2 top-2 flex items-center justify-between pointer-events-none',
                button_previous: 'pointer-events-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded text-text-placeholder transition-colors hover:bg-surface hover:text-text',
                button_next:     'pointer-events-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded text-text-placeholder transition-colors hover:bg-surface hover:text-text',
                weekdays:       'flex',
                weekday:        'flex h-8 w-8 items-center justify-center text-[10px] font-semibold uppercase tracking-wider text-text-placeholder',
                week:           'flex',
                day:            'p-0',
                day_button:     'flex h-8 w-8 cursor-pointer items-center justify-center rounded text-xs text-text transition-colors hover:bg-surface aria-selected:bg-primary aria-selected:text-white aria-selected:hover:bg-primary-hover disabled:cursor-not-allowed disabled:text-text-placeholder disabled:opacity-40 disabled:hover:bg-transparent',
                today:          'font-bold text-primary aria-selected:text-white',
                outside:        'text-text-placeholder/60',
              }}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === 'left'
                    ? <ChevronLeft size={14} />
                    : <ChevronRight size={14} />,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
