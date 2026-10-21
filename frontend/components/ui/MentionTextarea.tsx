'use client';

import { useEffect, useRef, useState } from 'react';
import { memberColor } from '@/lib/project.utils';
import type { Member } from '@/types/api.types';

interface SelectedMention { id: string; name: string }

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  members: Member[];
  className?: string;
  /** When true, the underlying textarea receives focus on mount. Use this
   *  for composers that appear in response to a user click (reply, edit
   *  comment) so the cursor lands in the field without an extra click.
   *  Native `autoFocus` attribute — fires once at element mount only. */
  autoFocus?: boolean;
  /** Emits the user ids the author has EXPLICITLY picked from the dropdown
   *  (id-bound — survives duplicate display names). Notifications route on
   *  these; a typed-but-unselected `@name` carries no id and notifies nobody.
   *  Pruned automatically when the matching `@name` is deleted from the text. */
  onMentionsChange?: (ids: string[]) => void;
  /** Mentions to treat as already-selected at mount — e.g. a reply pre-filled
   *  with "@Author " is a deliberate mention, so we bind it without forcing a
   *  re-pick (and it won't trip the "not selected" warning). */
  initialMentions?: SelectedMention[];
  /** Grows from `rows` up to `maxRows` as content is typed, then scrolls.
   *  Off by default — existing callers keep their fixed-height behavior. */
  autoResize?: boolean;
  /** Row cap for `autoResize`. */
  maxRows?: number;
  /** Paste handler forwarded to the underlying textarea. Composers use it to
   *  catch a Ctrl+V'd screenshot and attach it (see useAttachments). */
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

// A char that can continue a display name. Used for the word boundary after a
// matched "@<name>" so "@Al" doesn't match inside "@Alice".
const NAME_CHAR = /[a-z0-9]/i;

// Start indices of every boundary-respecting occurrence of `needle` in `hay`
// (both lower-cased by the caller).
function occurrences(hay: string, needle: string): number[] {
  const out: number[] = [];
  let from = 0;
  while (from <= hay.length) {
    const i = hay.indexOf(needle, from);
    if (i === -1) break;
    const after = hay[i + needle.length];
    if (after === undefined || !NAME_CHAR.test(after)) out.push(i);
    from = i + needle.length;
  }
  return out;
}

// Walks backward from cursor position looking for an active @mention query.
// Returns null if cursor is not inside an @mention (i.e. a space/newline intervenes).
function findMention(text: string, cursor: number): { query: string; start: number } | null {
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') return { query: text.slice(i + 1, cursor), start: i };
    if (ch === ' ' || ch === '\n') break;
    i--;
  }
  return null;
}

export function MentionTextarea({
  value, onChange, onSubmit, placeholder, rows = 3, disabled, members, className, autoFocus,
  onMentionsChange, initialMentions, autoResize = false, maxRows = 10, onPaste,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention,   setMention]   = useState<{ query: string; start: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Mentions the user has explicitly picked. A ref (not state) because the
  // recompute reads + rewrites it synchronously inside the change handler; the
  // derived ids/warning live in state for rendering.
  const selectedRef = useRef<SelectedMention[]>(initialMentions ?? []);
  const [unselected, setUnselected] = useState<string[]>([]);

  // Re-derive everything from the current text: prune selections whose "@name"
  // was deleted, push the surviving ids up, and flag any "@fragment" that looks
  // like a mention attempt but was never picked from the list.
  function recompute(text: string) {
    const lower = text.toLowerCase();

    // Covered = the [start, end) span of each surviving selected "@name". A
    // selection survives only while its "@name" is still present in the text.
    const covered = new Set<number>();
    const live = selectedRef.current.filter((s) => {
      const occ = occurrences(lower, `@${s.name.toLowerCase()}`);
      occ.forEach((start) => covered.add(start));
      return occ.length > 0;
    });
    selectedRef.current = live;
    onMentionsChange?.([...new Set(live.map((s) => s.id))]);

    // Any "@word" NOT starting a covered span is an unbound attempt. Warn only
    // when the fragment is a prefix of a real member name (so "@here" or an
    // email address doesn't nag) — that's the signal the user meant to mention.
    const attempts: string[] = [];
    const re = /@([^\s@]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (covered.has(m.index)) continue;
      const frag = m[1];
      if (!frag) continue;
      const fragLower = frag.toLowerCase();
      if (members.some((mem) => mem.name.toLowerCase().startsWith(fragLower))) attempts.push(frag);
    }
    setUnselected([...new Set(attempts)]);
  }

  // Seed derived state from the initial value (e.g. reply pre-fill) once.
  useEffect(() => {
    recompute(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus + cursor-at-end on mount when autoFocus is set. Native `autoFocus`
  // alone places the cursor at position 0 when the textarea mounts with a
  // pre-filled value (e.g. "@Alice " for a YouTube-style reply-to-reply),
  // which forces the user to End-key or click to type after the mention.
  // Effect runs once at mount only — value changes after typing keep the
  // cursor wherever the user left it.
  useEffect(() => {
    if (!autoFocus) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to auto first so scrollHeight reflects shrinking too, not just growth.
  useEffect(() => {
    if (!autoResize) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * maxRows;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, autoResize, maxRows]);

  const filtered = mention
    ? members.filter(m => m.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next   = e.target.value;
    const cursor = e.target.selectionStart ?? next.length;
    onChange(next);
    recompute(next);
    const m = findMention(next, cursor);
    setMention(m);
    setActiveIdx(0);
  }

  function insertMention(member: Member) {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after  = value.slice(mention.start + 1 + mention.query.length);
    const next   = `${before}@${member.name} ${after}`;
    onChange(next);
    // Bind the picked member's id so this "@name" notifies the exact person
    // (not a name match). De-dupe by id in case they're picked twice.
    selectedRef.current = [...selectedRef.current.filter((s) => s.id !== member.id), { id: member.id, name: member.name }];
    recompute(next);
    setMention(null);
    // Restore focus + move cursor past the inserted mention
    setTimeout(() => {
      if (!textareaRef.current) return;
      const pos = mention.start + member.name.length + 2; // "@" + name + " "
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[activeIdx]) insertMention(filtered[activeIdx]!);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    // Ctrl/Cmd+Enter always submits
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      onSubmit();
    }
  }

  // Close mention if cursor moves outside the @-word (e.g. user clicks elsewhere)
  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const cursor = (e.target as HTMLTextAreaElement).selectionStart ?? value.length;
    const m = findMention(value, cursor);
    if (!m) setMention(null);
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        onPaste={onPaste}
        onBlur={() => {
          // Delay so onMouseDown on a dropdown item fires first
          setTimeout(() => setMention(null), 150);
        }}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
      />

      {/* @mention dropdown */}
      {mention && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-60 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
            Mention
          </p>
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); insertMention(m); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                i === activeIdx
                  ? 'bg-primary/10 text-primary'
                  : 'text-text hover:bg-surface'
              }`}
            >
              <div
                style={{ backgroundColor: memberColor(m.id) }}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              >
                {m.initials}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium leading-tight">{m.name}</p>
                <p className="truncate text-xs text-text-placeholder">{m.role_name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Unselected-mention warning. A typed "@name" only notifies someone when
          it was picked from the dropdown (id-bound). Nudge the user to select,
          but don't block — they can still post it as plain text. */}
      {unselected.length > 0 && (
        <p className="mt-1 text-[11px] leading-snug text-warning">
          {unselected.map(u => `@${u}`).join(', ')}{' '}
          {unselected.length > 1 ? "aren't selected" : "isn't selected"} — pick{' '}
          {unselected.length > 1 ? 'them' : 'the name'} from the list to notify, otherwise it posts as plain text.
        </p>
      )}
    </div>
  );
}
