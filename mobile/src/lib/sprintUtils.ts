// Sprint display helpers — ported from web lib/sprint.utils.ts
import type { Sprint, SprintStatus } from '@/types/api.types';

export type SprintDisplayStatus = 'Active' | 'Completed' | 'Planned' | 'Archived';

/** archivedAt wins over status (archived completed sprint shows "Archived"). */
export function sprintDisplayStatus(
  sprint: Pick<Sprint, 'status' | 'archivedAt'>,
): { label: SprintDisplayStatus; colorKey: 'success' | 'info' | 'textPlaceholder' | 'textSubtle' } {
  if (sprint.archivedAt) return { label: 'Archived', colorKey: 'textSubtle' };
  switch (sprint.status) {
    case 'active':
      return { label: 'Active', colorKey: 'success' };
    case 'completed':
      return { label: 'Completed', colorKey: 'info' };
    default:
      return { label: 'Planned', colorKey: 'textPlaceholder' };
  }
}

export function isLiveSprint(sprint: Pick<Sprint, 'archivedAt'>): boolean {
  return !sprint.archivedAt;
}

/** Sort: active → planned (startDate desc) → completed. */
export function sortSprints<T extends Pick<Sprint, 'status' | 'startDate'>>(sprints: T[]): T[] {
  const rank: Record<SprintStatus, number> = { active: 0, planned: 1, completed: 2 };
  return [...sprints].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return (b.startDate || '').localeCompare(a.startDate || '');
  });
}

/** Default next sprint name (web CreateSprintModal heuristic). */
export function computeDefaultSprintName(projectKey: string, existing: string[]): string {
  let max = 0;
  let found = false;
  for (const name of existing) {
    const m = /(\d+)\s*$/.exec(name);
    if (m) {
      found = true;
      max = Math.max(max, Number(m[1]));
    }
  }
  const n = found ? max + 1 : existing.length + 1;
  return `${projectKey} Sprint ${n}`;
}

/** Completion percentage from a sprint's tickets. */
export function sprintProgress(tickets: { status: string }[]): {
  done: number;
  total: number;
  pct: number;
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
  for (const t of tickets) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const total = tickets.length;
  const done = counts.done ?? 0;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, counts };
}
