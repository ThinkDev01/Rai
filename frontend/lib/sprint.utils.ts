import type { Sprint } from '@/types/api.types';

// Single source of truth for "how do we label and color a sprint's state?"
// Used by the sidebar, overview, backlog, archive, sprint detail, and reports
// pages. Keeps the visual vocabulary consistent.
//
// Style direction (per UI-pass feedback): pill SHAPE stays the same as
// before, but the differentiation moves from filled backgrounds to colored
// text + border. Lighter on the eye when multiple pills sit next to each
// other in lists (sidebar, sprint history); the bright filled pills used
// to read as buttons or notification badges.

export interface SprintDisplayStatus {
  /** Label shown inside the pill. */
  label: string;
  /** Tailwind classes for the pill - border + text color only, no fill.
   *  Combine with the shared pill shape: `inline-flex items-center
   *  rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase`. */
  pillCls: string;
}

const STATUS_STYLES = {
  active:    { label: 'Active',    pillCls: 'border-success/60 text-success'                  },
  completed: { label: 'Completed', pillCls: 'border-info/50 text-info'                        },
  planned:   { label: 'Planned',   pillCls: 'border-border text-text-placeholder'             },
  archived:  { label: 'Archived',  pillCls: 'border-text-placeholder/40 text-text-placeholder'},
} as const;

/**
 * Resolve a sprint's display state. `archivedAt` wins over `status` (an
 * archived completed sprint shows as Archived in lists; the underlying
 * status is kept as historical record). All callers should route through
 * this so the labels stay consistent.
 */
export function sprintDisplayStatus(sprint: Pick<Sprint, 'status' | 'archivedAt'>): SprintDisplayStatus {
  if (sprint.archivedAt) return STATUS_STYLES.archived;
  return STATUS_STYLES[sprint.status];
}

/** Shared base classes for the sprint pill. */
export const SPRINT_PILL_BASE =
  'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none';

/**
 * True when the sprint should appear in the regular (non-archive) sprint
 * lists - sidebar sprint section, backlog sprint sections, overview
 * sprint history. Archived sprints live exclusively on the Archive page.
 */
export function isLiveSprint(sprint: Pick<Sprint, 'archivedAt'>): boolean {
  return !sprint.archivedAt;
}
