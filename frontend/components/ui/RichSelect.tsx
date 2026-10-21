'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from '@/lib/icons';

// Custom popover-based select used wherever native `<select>` falls short -
// per-option icons, avatars, colored rows, trailing badges. Native `<option>`
// elements can't be styled per-row cross-browser.
//
// Positioning: portal-rendered into document.body at `position: fixed`
// coords computed from the trigger's bounding rect. This decouples the
// popover from any parent overflow / sticky / clipping context. The
// popover's `maxHeight` is clamped to the room below the trigger so it
// never extends past the viewport - the popover scrolls internally if
// there are more options than fit. Position updates on scroll + resize.

// useLayoutEffect on the client, useEffect during SSR.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const POPOVER_MAX_PX = 288;   // matches `max-h-72` semantically
const POPOVER_MIN_PX = 120;   // minimum room before we nudge page scroll
const POPOVER_GAP    = 4;     // gap between trigger and popover
const VIEWPORT_PAD   = 12;    // breathing room from viewport bottom

export interface RichSelectOption<V extends string = string> {
  value:    V;
  label:    string;
  /** Rendered to the LEFT of label, both in trigger (when selected) + each option row. */
  leading?: React.ReactNode;
  /** Rendered to the RIGHT of label (e.g. Sprint "Active" pill). */
  trailing?: React.ReactNode;
  /** Extra classes applied to that option's row in the open list. Lets us
   *  paint a yellow row for "In Progress", blue for "In Review", etc. */
  rowCls?:  string;
  /** Optional disabled flag for individual options. */
  disabled?: boolean;
}

interface RichSelectProps<V extends string> {
  value:             V;
  options:           RichSelectOption<V>[];
  onChange:          (value: V) => void;
  disabled?:         boolean;
  title?:            string;
  /** Per-render trigger className - e.g. accent-colored border/text for
   *  the currently selected status. */
  triggerClassName?: string;
  /** Optional label to show when value doesn't match any option. */
  placeholder?:      string;
}

interface PopoverPos {
  top:       number;
  left:      number;
  width:     number;
  maxHeight: number;
}

export function RichSelect<V extends string>({
  value, options, onChange, disabled, title, triggerClassName, placeholder = 'Select…',
}: RichSelectProps<V>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<PopoverPos | null>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc. The popover is in a portal so we have to
  // check both the wrapper AND the popover ref.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        (wrapRef.current && wrapRef.current.contains(t)) ||
        (popoverRef.current && popoverRef.current.contains(t))
      ) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Compute + track popover position from trigger rect. Listens to ANY
  // scroll (capture=true) and resize so the popover stays glued to the
  // trigger while the page moves around.
  useIsoLayoutEffect(() => {
    if (!open) return;

    function update() {
      const el = wrapRef.current;
      if (!el) return;
      const rect       = el.getBoundingClientRect();
      const top        = rect.bottom + POPOVER_GAP;
      const spaceBelow = window.innerHeight - top - VIEWPORT_PAD;

      // If less than min height available below, nudge the page so the
      // trigger sits higher and there's room below. The scroll event will
      // re-fire this function naturally as the smooth scroll progresses.
      if (spaceBelow < POPOVER_MIN_PX) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      const clamped = Math.max(80, Math.min(POPOVER_MAX_PX, spaceBelow));
      setPos({
        top,
        left:      rect.left,
        width:     rect.width,
        maxHeight: clamped,
      });
    }

    update();
    // capture=true so we catch scrolls in ancestor scroll containers too,
    // not just on window.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        disabled={disabled}
        title={title}
        className={`flex w-full items-center gap-2 rounded-md border bg-surface-raised pl-3 pr-2 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 ${
          triggerClassName ?? 'border-border text-text hover:border-text-placeholder'
        } ${disabled ? '' : 'cursor-pointer'}`}
      >
        {selected?.leading && <span className="flex flex-shrink-0 items-center">{selected.leading}</span>}
        <span className="flex-1 truncate text-left">
          {selected?.label ?? placeholder}
        </span>
        {selected?.trailing}
        <ChevronDown
          size={14}
          className={`flex-shrink-0 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && !disabled && pos && typeof window !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top:       pos.top,
            left:      pos.left,
            width:     pos.width,
            maxHeight: pos.maxHeight,
          }}
          className="z-[60] overflow-y-auto rounded-md border border-border bg-surface-raised shadow-xl ring-1 ring-black/5 scrollbar-subtle"
        >
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSelected ? 'bg-primary-subtle' : ''
                } ${opt.rowCls ?? 'text-text'}`}
              >
                {opt.leading && <span className="flex flex-shrink-0 items-center">{opt.leading}</span>}
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.trailing}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
