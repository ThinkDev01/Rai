'use client';

import { useLayoutEffect, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bug, BookOpen, CheckSquare, Zap, Search, ChevronDown, UserX,
  AlertCircle, ChevronUp, Minus, ChevronsDown,
} from '@/lib/icons';
import { memberColor } from '@/lib/project.utils';
import { loadStoredAssignees, saveStoredAssignees } from '@/lib/boardFilters';
import { useAuthStore } from '@/store/auth.store';
import type { Project } from '@/types/api.types';

// useLayoutEffect on the client, useEffect during SSR.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type TypeFilter = 'all' | 'epic' | 'story' | 'task' | 'bug';

// Mirrors the backend's Priority union (see types/api.types.ts) plus the
// 'all' sentinel, same shape as TypeFilter above.
export type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'lowest';

// Sentinel id used to filter tickets where assignee === null. Distinct string
// (not '') so a real member id accidentally returning '' can't match the
// "unassigned" filter and vice versa. Callers (board / backlog pages) reduce
// each ticket's assignee id to this sentinel before doing the includes()
// check, so the existing array-membership filter logic keeps working unchanged.
export const UNASSIGNED_FILTER = '__unassigned__';

const TYPE_OPTIONS: { value: TypeFilter; label: string; icon: React.ReactNode; activeClass: string }[] = [
  { value: 'all',   label: 'All types', icon: null,                    activeClass: 'bg-primary text-white border-primary'     },
  { value: 'epic',  label: 'Epic',      icon: <Zap         size={12}/>, activeClass: 'bg-epic/10 text-epic border-epic/30'    },
  { value: 'story', label: 'Story',     icon: <BookOpen    size={12}/>, activeClass: 'bg-story/10 text-story border-story/30' },
  { value: 'task',  label: 'Task',      icon: <CheckSquare size={12}/>, activeClass: 'bg-task/10 text-task border-task/30'    },
  { value: 'bug',   label: 'Bug',       icon: <Bug         size={12}/>, activeClass: 'bg-bug/10 text-bug border-bug/30'       },
];

// Same shape as TYPE_OPTIONS above, so the Priority dropdown's trigger can
// use the exact same chip styling (border, px-2 py-0.5, text-[11px]) as the
// Type filter - visual parity, not a fixed-width control.
const PRIORITY_OPTIONS: { value: PriorityFilter; label: string; icon: React.ReactNode; activeClass: string }[] = [
  { value: 'all',      label: 'All priorities', icon: null,                        activeClass: 'bg-primary text-white border-primary' },
  { value: 'critical', label: 'Critical',        icon: <AlertCircle  size={12}/>, activeClass: 'bg-priority-critical/10 text-priority-critical border-priority-critical/30' },
  { value: 'high',     label: 'High',            icon: <ChevronUp    size={12}/>, activeClass: 'bg-priority-high/10 text-priority-high border-priority-high/30'          },
  { value: 'medium',   label: 'Medium',          icon: <Minus        size={12}/>, activeClass: 'bg-priority-medium/10 text-priority-medium border-priority-medium/30'    },
  { value: 'low',      label: 'Low',             icon: <ChevronDown  size={12}/>, activeClass: 'bg-priority-low/10 text-priority-low border-priority-low/30'             },
  { value: 'lowest',   label: 'Lowest',          icon: <ChevronsDown size={12}/>, activeClass: 'bg-priority-lowest/10 text-priority-lowest border-priority-lowest/30'    },
];

const MAX_VISIBLE = 4;

interface Props {
  project: Project;
  onFilterChange?: (type: TypeFilter, assignees: string[], priority: PriorityFilter) => void;
}

export function ProjectSubNav({ project, onFilterChange }: Props) {
  const userId = useAuthStore(s => s.user?.id);

  // Default is "no filter" - board / backlog land showing every ticket in
  // the sprint, not just the caller's own. Was previously "default to me"
  // (pre-selecting the caller's id), which hid the rest of the team's work
  // from anyone landing on the board fresh (e.g. a PM).
  //
  // The chosen filter persists per project + user in localStorage, so a
  // same-session page refresh restores it - but a FRESH sign-in always
  // resets to all-tickets: auth.store's hydrate() wipes this user's saved
  // filters once /me resolves their real id, right after a new login or
  // federated callback (see applyFreshLoginReset in lib/boardFilters.ts), so
  // there's nothing left to restore on the first load of a new session even
  // if this exact user had "Me" selected last time.
  const [activeType,      setActiveType]    = useState<TypeFilter>('all');
  const [activeAssignees, setAssignees] = useState<string[]>(() => loadStoredAssignees(project.id, userId));
  // Priority filter: independent of type/assignee (no mutual exclusivity),
  // single-select like type. Deliberately NOT persisted - unlike assignee,
  // it always starts at 'all' and resets on navigation/refresh.
  const [activePriority,  setActivePriority] = useState<PriorityFilter>('all');
  // Priority's own popover open-state + position tracking, separate from
  // the assignee "+N more" popover below (same portal-to-body pattern, so
  // it isn't clipped by the parent's md:overflow-x-auto either).
  const [priorityOpen, setPriorityOpen] = useState(false);
  const priorityTriggerRef = useRef<HTMLDivElement>(null);
  const priorityPopoverRef = useRef<HTMLDivElement>(null);
  const [priorityPopPos, setPriorityPopPos] = useState<{ top: number; left: number } | null>(null);
  const [dropdownOpen,    setDropdownOpen]  = useState(false);
  const [search,          setSearch]        = useState('');
  // Popover position is computed from the trigger button's bounding rect
  // every time the dropdown opens (+ on scroll/resize while open). We
  // portal the popover to document.body via position: fixed so the
  // parent's `md:overflow-x-auto` can't clip it - that was the original
  // "+47 more" bug: dropdown opened fine but was hidden by the parent
  // scroll container.
  const triggerRef  = useRef<HTMLDivElement>(null);
  const popoverRef  = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  // Member ordering — current user pinned to the front so their avatar
  // sits right beside Unassigned. Makes "filter to my tickets" a one-tap
  // gesture even on long member lists where the caller would otherwise
  // have to open the +N more popover to find themselves.
  const members = (() => {
    if (!userId) return project.members;
    const self  = project.members.find(m => m.id === userId);
    const rest  = project.members.filter(m => m.id !== userId);
    return self ? [self, ...rest] : project.members;
  })();
  const visibleMembers = members.slice(0, MAX_VISIBLE);
  const hasOverflow    = members.length > MAX_VISIBLE;
  const overflowCount  = members.length - MAX_VISIBLE;

  // Popover search uses the same self-first ordering so the caller's own
  // entry appears at the top of the search list too.
  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggleAssignee(id: string) {
    setAssignees(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  }

  useEffect(() => {
    onFilterChange?.(activeType, activeAssignees, activePriority);
  }, [activeType, activeAssignees, activePriority]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist on every change so a same-session refresh restores it. Runs
  // after the lazy-init read above, so this never clobbers a freshly-loaded
  // stored value with the initial state on mount.
  useEffect(() => {
    saveStoredAssignees(project.id, userId, activeAssignees);
  }, [project.id, userId, activeAssignees]);

  useEffect(() => {
    if (!dropdownOpen) { setSearch(''); return; }
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (
        (triggerRef.current && triggerRef.current.contains(t)) ||
        (popoverRef.current && popoverRef.current.contains(t))
      ) return;
      setDropdownOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  // Position the portaled popover under the trigger; track scroll + resize
  // so it stays glued as the page moves.
  useIsoLayoutEffect(() => {
    if (!dropdownOpen) return;
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = rect.bottom + 4;
      const spaceBelow = window.innerHeight - top - 12;
      setPopPos({
        top,
        left:      rect.left,
        maxHeight: Math.max(160, Math.min(360, spaceBelow)),
      });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [dropdownOpen]);

  // Priority popover: close on outside click / Escape - same handler shape
  // as the assignee popover above, just scoped to its own refs/state.
  useEffect(() => {
    if (!priorityOpen) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (
        (priorityTriggerRef.current && priorityTriggerRef.current.contains(t)) ||
        (priorityPopoverRef.current && priorityPopoverRef.current.contains(t))
      ) return;
      setPriorityOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPriorityOpen(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [priorityOpen]);

  // Position the portaled priority popover under its trigger chip.
  useIsoLayoutEffect(() => {
    if (!priorityOpen) return;
    function update() {
      const el = priorityTriggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPriorityPopPos({ top: rect.bottom + 4, left: rect.left });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [priorityOpen]);

  const selectedPriority = PRIORITY_OPTIONS.find(o => o.value === activePriority) ?? PRIORITY_OPTIONS[0];

  return (
    <div className="sticky top-14 z-10 border-b border-border bg-surface-raised flex-shrink-0 md:overflow-x-auto">
      {/* Mobile: stack Assignee row above Type row so cramped chips/avatars
          have full width and can wrap naturally. Desktop (md+): inline as
          before, with horizontal scroll if it overflows. */}
      <div className="flex flex-col gap-2 px-4 py-2 md:flex-row md:items-center md:gap-3 md:px-6 md:py-2.5 md:min-w-max">

      {/* Assignee.
          Outer row keeps a tighter gap between the label and the avatar
          cluster (the chip group itself is gap-1 so all avatars including
          Unassigned read as one tight set). Previous gap-2 split the
          unassigned chip visually away from the rest of the team. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[11px] font-medium text-text-placeholder">Assignee</span>

        {/* Tight group: Unassigned + visible member avatars + "+N more"
            trigger all sit together with the same gap (gap-1). */}
        <div className="flex items-center gap-1">

          {/* Unassigned chip - solid border (was border-dashed; the dashed
              treatment renders with visible gaps at this size and read as
              a broken circle). Visually distinct from real members via
              the UserX glyph + lighter fill instead. */}
          <button
            title="Unassigned"
            onClick={() => toggleAssignee(UNASSIGNED_FILTER)}
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-100
              ${activeAssignees.includes(UNASSIGNED_FILTER)
                ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary ring-offset-1 opacity-100'
                : 'border-text-placeholder/60 bg-surface text-text-placeholder opacity-70 hover:border-primary/40 hover:text-text hover:opacity-100'
              }`}
            aria-pressed={activeAssignees.includes(UNASSIGNED_FILTER)}
          >
            <UserX size={11} strokeWidth={2.25} />
          </button>
          {visibleMembers.map(member => {
            const active = activeAssignees.includes(member.id);
            return (
              <button
                key={member.id}
                title={member.name}
                onClick={() => toggleAssignee(member.id)}
                style={{ backgroundColor: memberColor(member.id) }}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white
                  border-2 transition-all duration-100
                  ${active
                    ? 'border-primary ring-2 ring-primary ring-offset-1 opacity-100'
                    : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
              >
                {member.initials}
              </button>
            );
          })}

          {/* +N more trigger - sits inside the tight group with the
              avatars so the whole assignee cluster reads as one set.
              Opens a portaled search popover that lists ALL members.
              Popover escapes the parent via portal so the outer
              overflow-x-auto can't clip it. */}
          {hasOverflow && (
            <div ref={triggerRef} className="relative ml-1">
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors
                ${dropdownOpen || activeAssignees.some(id => members.slice(MAX_VISIBLE).map(m => m.id).includes(id))
                  ? 'border-primary bg-primary-subtle text-primary'
                  : 'border-border bg-surface text-text-placeholder hover:border-primary/40 hover:text-text'
                }`}
            >
              +{overflowCount} more
              <ChevronDown size={11} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && popPos && typeof window !== 'undefined' && createPortal(
              <div
                ref={popoverRef}
                style={{
                  position: 'fixed',
                  top:      popPos.top,
                  left:     popPos.left,
                  width:    288,
                  maxHeight: popPos.maxHeight,
                }}
                className="z-[60] flex flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl ring-1 ring-black/5"
              >
                {/* Search input - autofocused so user can type immediately */}
                <div className="flex-shrink-0 border-b border-border px-3 py-2">
                  <div className="relative">
                    <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-placeholder" />
                    <input
                      autoFocus
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search members…"
                      className="w-full rounded border border-border bg-surface py-1 pl-6 pr-2 text-xs text-text outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* Member list - scrolls internally with the slim scrollbar */}
                <div className="flex-1 overflow-y-auto scrollbar-subtle py-1">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-3 text-center text-xs text-text-placeholder">No members found</p>
                  ) : filtered.map(member => {
                    const active = activeAssignees.includes(member.id);
                    return (
                      <button
                        key={member.id}
                        onClick={() => toggleAssignee(member.id)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface
                          ${active ? 'bg-primary-subtle' : ''}`}
                      >
                        <span
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: memberColor(member.id) }}
                        >
                          {member.initials}
                        </span>
                        <div className="flex-1 min-w-0 text-left">
                          <p className={`truncate text-sm ${active ? 'font-medium text-primary' : 'text-text'}`}>
                            {member.name}
                          </p>
                          <p className="text-[10px] text-text-placeholder">{member.role_name}</p>
                        </div>
                        {active && (
                          <span className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded bg-primary text-[10px] text-white">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

              </div>,
              document.body,
            )}
          </div>
        )}
        </div>
      </div>

      <div className="hidden md:block h-4 w-px bg-border" />

      {/* Type filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-text-placeholder">Type</span>
        <div className="flex flex-wrap items-center gap-1">
          {TYPE_OPTIONS.map(opt => {
            const active = activeType === opt.value;
            return (
              <button
                key={opt.value}
                // Click the already-active type to toggle it back off (→ 'all'),
                // mirroring the assignee avatars. 'all' is a no-op toggle since
                // it's the cleared state. The "All types" chip stays as an
                // explicit one-tap reset too.
                onClick={() => setActiveType(active && opt.value !== 'all' ? 'all' : opt.value)}
                // `transition-all duration-100 ease-out` keeps bg + text
                // + border all in sync — previously `transition-colors` at
                // the default 150ms left the high-contrast white→grey text
                // change visibly trailing the blue→grey bg fade when
                // deactivating a chip. 100ms reads as one snap.
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-all duration-100 ease-out
                  ${active
                    ? opt.activeClass
                    : 'border-border bg-surface text-text-subtle hover:border-primary/40 hover:text-text'
                  }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden md:block h-4 w-px bg-border" />

      {/* Priority filter - dropdown box, independent of Type/Assignee (no
          mutual exclusivity, no persistence - always starts at 'all' and
          resets on navigation/refresh). Trigger reuses the Type filter's
          exact chip classes for visual parity, and sizes to its content
          (label + icon) rather than a fixed width. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-text-placeholder">Priority</span>
        <div ref={priorityTriggerRef} className="relative">
          <button
            onClick={() => setPriorityOpen(v => !v)}
            className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-all duration-100 ease-out
              ${activePriority !== 'all'
                ? selectedPriority.activeClass
                : 'border-border bg-surface text-text-subtle hover:border-primary/40 hover:text-text'
              }`}
          >
            {selectedPriority.icon}
            {selectedPriority.label}
            <ChevronDown size={11} className={`transition-transform ${priorityOpen ? 'rotate-180' : ''}`} />
          </button>

          {priorityOpen && priorityPopPos && typeof window !== 'undefined' && createPortal(
            <div
              ref={priorityPopoverRef}
              style={{ position: 'fixed', top: priorityPopPos.top, left: priorityPopPos.left, width: 152 }}
              className="z-[60] flex flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl ring-1 ring-black/5 py-1"
            >
              {PRIORITY_OPTIONS.map(opt => {
                const active = activePriority === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { setActivePriority(opt.value); setPriorityOpen(false); }}
                    className={`flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface
                      ${active ? 'bg-primary-subtle font-medium text-primary' : 'text-text'}`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )}
        </div>
      </div>

    </div>
    </div>
  );
}

// memberColor moved to lib/project.utils.ts so every avatar surface uses
// the same per-user color (was local here, hard-coded bg-primary
// elsewhere - same user rendered different colors across the app).
