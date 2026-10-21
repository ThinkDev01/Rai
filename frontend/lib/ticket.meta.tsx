import {
  Bug, BookOpen, CheckSquare, Zap,
  AlertCircle, ChevronUp, Minus, ChevronDown, ChevronsDown,
} from 'lucide-react';
import type { RichSelectOption } from '@/components/ui/RichSelect';
import { memberColor } from '@/lib/project.utils';
import type { Member, Sprint, Ticket, TicketType, Priority, TicketStatus, EpicColor } from '@/types/api.types';

// Epic color swatch map (name → hex), matches backend EPIC_COLORS.
export const EPIC_COLOR_HEX: Record<EpicColor, string> = {
  slate:  '#64748b',
  blue:   '#3b82f6',
  teal:   '#14b8a6',
  green:  '#22c55e',
  amber:  '#f59e0b',
  orange: '#f97316',
  red:    '#ef4444',
  pink:   '#ec4899',
  purple: '#a855f7',
  indigo: '#6366f1',
};

// Standard Fibonacci story-point scale shown in the picker. The backend accepts
// any 0..999 integer, but these cover normal estimation.
export const STORY_POINT_VALUES = [1, 2, 3, 5, 8, 13, 21] as const;

// Build a key→{name,color} map of all epics in a ticket list, so a child
// ticket can render its parent epic's colored tag by looking up `parentKey`.
// Name falls back to the epic's title when no explicit epic name is set.
export function buildEpicLookup(tickets: Ticket[]): Map<string, { name: string; color: string }> {
  const map = new Map<string, { name: string; color: string }>();
  for (const t of tickets) {
    if (t.type === 'epic') {
      map.set(t.key, { name: t.epicName?.trim() || t.title, color: t.epicColor || 'slate' });
    }
  }
  return map;
}

// Shared ticket-property meta tables + RichSelect option builders. Used by
// both the ticket detail page and the create-ticket modal so we don't have
// two divergent copies of the icon / colour / pill story.
//
//   TYPE_META.cls       - tinted chip (text + bg/10) for inline rendering
//   PRIORITY_META.cls   - text colour only (icons inherit it)
//   STATUS_META.cls     - inline pill (sub-ticket badges, read-only status)
//   STATUS_META.selectCls - text + border accent for the RichSelect trigger
//                            of the currently-selected status (no flood bg)
//   STATUS_META.rowCls    - text colour for THAT option's row in the open
//                            dropdown list (yellow for In Progress, etc.)
//   STATUS_META.dot       - leading colored bullet, shown in both the
//                            trigger and each option row

export const TYPE_META: Record<TicketType, { icon: React.ReactNode; label: string; cls: string }> = {
  bug:   { icon: <Bug         size={13} />, label: 'Bug',   cls: 'text-bug   bg-bug/10'   },
  story: { icon: <BookOpen    size={13} />, label: 'Story', cls: 'text-story bg-story/10' },
  task:  { icon: <CheckSquare size={13} />, label: 'Task',  cls: 'text-task  bg-task/10'  },
  epic:  { icon: <Zap         size={13} />, label: 'Epic',  cls: 'text-epic  bg-epic/10'  },
};

export const PRIORITY_META: Record<Priority, { icon: React.ReactNode; label: string; cls: string }> = {
  critical: { icon: <AlertCircle  size={13} />, label: 'Critical', cls: 'text-priority-critical' },
  high:     { icon: <ChevronUp    size={13} />, label: 'High',     cls: 'text-priority-high'     },
  medium:   { icon: <Minus        size={13} />, label: 'Medium',   cls: 'text-priority-medium'   },
  low:      { icon: <ChevronDown  size={13} />, label: 'Low',      cls: 'text-priority-low'      },
  lowest:   { icon: <ChevronsDown size={13} />, label: 'Lowest',   cls: 'text-priority-lowest'   },
};

export const STATUS_META: Record<TicketStatus, { label: string; cls: string; selectCls: string; rowCls: string; dot: string }> = {
  todo:        { label: 'To Do',       cls: 'bg-surface text-text-subtle border-border',       selectCls: 'border-border text-text-subtle',                  rowCls: 'text-text-subtle',           dot: 'bg-text-placeholder' },
  in_progress: { label: 'In Progress', cls: 'bg-warning-subtle text-warning border-warning/30', selectCls: 'border-warning/50 text-warning font-semibold',    rowCls: 'text-warning font-medium',   dot: 'bg-warning'          },
  in_review:   { label: 'In Review',   cls: 'bg-info-subtle text-info border-info/30',          selectCls: 'border-info/50 text-info font-semibold',          rowCls: 'text-info font-medium',      dot: 'bg-info'             },
  done:        { label: 'Done',        cls: 'bg-success-subtle text-success border-success/30', selectCls: 'border-success/50 text-success font-semibold',   rowCls: 'text-success font-medium',   dot: 'bg-success'          },
};

// ── RichSelect option lists ──────────────────────────────────────────────────

export const STATUS_OPTIONS: RichSelectOption<TicketStatus>[] = (Object.keys(STATUS_META) as TicketStatus[]).map(s => ({
  value:   s,
  label:   STATUS_META[s].label,
  leading: <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />,
  rowCls:  STATUS_META[s].rowCls,
}));

export const PRIORITY_OPTIONS: RichSelectOption<Priority>[] = (Object.keys(PRIORITY_META) as Priority[]).map(p => ({
  value:   p,
  label:   PRIORITY_META[p].label,
  leading: <span className={`flex items-center ${PRIORITY_META[p].cls}`}>{PRIORITY_META[p].icon}</span>,
  rowCls:  `${PRIORITY_META[p].cls} font-medium`,
}));

export const TYPE_OPTIONS: RichSelectOption<TicketType>[] = (Object.keys(TYPE_META) as TicketType[]).map(t => ({
  value:   t,
  label:   TYPE_META[t].label,
  leading: <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${TYPE_META[t].cls}`}>{TYPE_META[t].icon}</span>,
}));

// Dynamic builders - depend on the current project's members / sprints / tickets.

export function buildAssigneeOptions(members: Member[]): RichSelectOption<string>[] {
  return [
    {
      value:   '',
      label:   'Unassigned',
      // Dashed circle on the lightest border was barely visible on white;
      // strengthened to text-placeholder border + faint surface bg so it
      // reads as "no assignee" at a glance.
      leading: <span className="h-5 w-5 rounded-full border border-dashed border-text-placeholder bg-surface" />,
      rowCls:  'text-text-subtle',
    },
    ...members.map(m => ({
      value:   m.id,
      label:   m.name,
      leading: (
        <span
          style={{ backgroundColor: memberColor(m.id) }}
          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
        >
          {m.initials}
        </span>
      ),
    })),
  ];
}

export function buildSprintOptions(sprints: Sprint[]): RichSelectOption<string>[] {
  return [
    { value: '', label: 'Backlog', rowCls: 'text-text-subtle' },
    ...sprints.map(s => ({
      value:    s.id,
      label:    s.name,
      trailing: s.status === 'active' ? (
        <span className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success">Active</span>
      ) : (
        <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-placeholder">Planned</span>
      ),
    })),
  ];
}

// Parent picker — shows type chip + key + truncated title. Used by the
// create-ticket modal; the detail page links to parent rather than editing it.
export function buildParentOptions(tickets: Ticket[]): RichSelectOption<string>[] {
  return [
    { value: '', label: 'No parent', rowCls: 'text-text-subtle' },
    ...tickets.map(t => ({
      value:   t.key,
      label:   `${t.key} — ${t.title.length > 50 ? t.title.slice(0, 50) + '…' : t.title}`,
      leading: <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${TYPE_META[t.type].cls}`}>{TYPE_META[t.type].icon}</span>,
    })),
  ];
}
