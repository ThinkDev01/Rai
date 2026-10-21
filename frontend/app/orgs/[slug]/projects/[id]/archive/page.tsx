'use client';

import { use, useState } from 'react';
import { usePageView } from '@/lib/usePageView';
import Link from 'next/link';
import { Archive, ArchiveRestore, Clock } from '@/lib/icons';
import { Bug, BookOpen, CheckSquare, Zap } from '@/lib/icons';
import { useProject } from '@/hooks/useProjects';
import { useUnarchiveSprint } from '@/hooks/useSprints';
import { useCurrentRole } from '@/store/auth.store';
import { PageError } from '@/components/ui/PageError';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { isNotFoundError } from '@/lib/errors';
import { MESSAGES } from '@/lib/messages';
import { formatDate } from '@/lib/dates';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { memberColor, projectColor } from '@/lib/project.utils';
import type { Sprint, TicketType, TicketStatus } from '@/types/api.types';

// Archive lists sprints with `archivedAt !== null`. Per v1-feedback Item 17,
// completed sprints stay in the regular list with a "Completed" tag - only
// MANUALLY archived sprints move here. Display matches the sprints index
// page card grid so the visual language stays consistent across the project.

const TYPE_ICON: Record<TicketType, React.ReactNode> = {
  bug:   <Bug         size={11} className="text-bug"   />,
  story: <BookOpen    size={11} className="text-story" />,
  task:  <CheckSquare size={11} className="text-task"  />,
  epic:  <Zap         size={11} className="text-epic"  />,
};

const STATUS_DOT: Record<TicketStatus, string> = {
  todo:        'bg-text-placeholder',
  in_progress: 'bg-warning',
  in_review:   'bg-info',
  done:        'bg-success',
};

// ── Per-archived-sprint card ─────────────────────────────────────────────────

function ArchivedSprintCard({ projectId, sprint, canManage }: {
  projectId: string;
  sprint:    Sprint;
  canManage: boolean;
}) {
  const slug = useCurrentSlug() ?? '';
  const { mutate: unarchiveSprint, isPending } = useUnarchiveSprint(projectId, sprint.id);
  // Inline view→confirm pattern per [[feedback_confirm_before_sensitive_action]].
  const [confirming, setConfirming] = useState(false);

  const tickets = sprint.tickets ?? [];
  const total   = tickets.length;
  const done    = tickets.filter(t => t.status === 'done').length;
  const todo    = tickets.filter(t => t.status === 'todo').length;
  const inProg  = tickets.filter(t => t.status === 'in_progress').length;
  const inRev   = tickets.filter(t => t.status === 'in_review').length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 100;

  const preview   = tickets.slice(0, 5);
  const remaining = total - preview.length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-sm transition-all duration-150 hover:border-primary/40 hover:shadow-md">

      {/* Header — name (link to sprint detail) + Archived pill + unarchive */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={orgRoute(slug, `/projects/${projectId}/sprints/${sprint.id}`)}
          className="group flex min-w-0 flex-1 flex-col"
        >
          <p className="truncate text-sm font-semibold text-text group-hover:text-primary transition-colors">
            {sprint.name}
          </p>
          {sprint.goal && (
            <p className="mt-0.5 line-clamp-1 text-xs text-text-placeholder">{sprint.goal}</p>
          )}
        </Link>
        <span className="flex-shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-placeholder">
          Archived
        </span>
      </div>

      {/* Dates */}
      {(sprint.startDate || sprint.endDate) && (
        <div className="flex items-center gap-1.5 text-[11px] text-text-placeholder">
          <Clock size={11} />
          <span>
            {sprint.startDate ? formatDate(sprint.startDate) : '?'}
            {' → '}
            {sprint.endDate ? formatDate(sprint.endDate) : '?'}
          </span>
        </div>
      )}

      {/* Ticket count strip */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'To Do',    count: todo,  cls: 'text-text-subtle' },
          { label: 'Progress', count: inProg, cls: 'text-warning' },
          { label: 'Review',   count: inRev,  cls: 'text-info' },
          { label: 'Done',     count: done,  cls: 'text-success' },
        ].map(({ label, count, cls }) => (
          <div key={label} className="rounded-md bg-surface px-2 py-1.5 text-center">
            <p className={`text-base font-bold ${cls}`}>{count}</p>
            <p className="text-[9px] uppercase tracking-wider text-text-placeholder">{label}</p>
          </div>
        ))}
      </div>

      {/* Ticket preview */}
      {preview.length > 0 ? (
        <div className="flex flex-col gap-1">
          {preview.map(t => (
            <Link
              key={t.id}
              href={orgRoute(slug, `/projects/${projectId}/tickets/${t.key}`)}
              className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-surface"
            >
              <span className="flex-shrink-0">{TYPE_ICON[t.type]}</span>
              <span className="w-16 flex-shrink-0 truncate font-mono text-[10px] text-text-placeholder">{t.key}</span>
              <span className="flex-1 truncate text-xs text-text">{t.title}</span>
              <span className={`flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[t.status]}`} title={t.status} />
              {t.assignee ? (
                <span
                  title={t.assignee.name}
                  style={{ backgroundColor: memberColor(t.assignee.id) }}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                >
                  {t.assignee.initials}
                </span>
              ) : (
                <span className="h-4 w-4 flex-shrink-0 rounded-full border border-dashed border-text-placeholder bg-surface" />
              )}
            </Link>
          ))}
          {remaining > 0 && (
            <p className="px-2 pt-1 text-[10px] text-text-placeholder">+ {remaining} more ticket{remaining === 1 ? '' : 's'}</p>
          )}
        </div>
      ) : (
        <p className="rounded bg-surface px-2 py-2 text-center text-[11px] italic text-text-placeholder">
          No tickets in this sprint.
        </p>
      )}

      {/* Progress + Unarchive footer */}
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <div className="flex items-center justify-between text-[11px] text-text-placeholder">
          <span>{total} ticket{total === 1 ? '' : 's'}</span>
          <span>{pct}% complete</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
        {/* Unarchive — inline view→confirm pattern. PM+ only. */}
        {canManage && (
          !confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded border border-success/40 px-2 py-1 text-xs font-medium text-success transition-colors hover:bg-success/10"
              title="Move this sprint back to the active list"
            >
              <ArchiveRestore size={12} />
              Unarchive
            </button>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="flex-1 text-[11px] text-text-subtle">Move sprint back to live?</span>
              <button
                onClick={() => unarchiveSprint(undefined, { onSuccess: () => setConfirming(false) })}
                disabled={isPending}
                className="rounded bg-success px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-60"
              >
                {isPending ? 'Unarchiving…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded border border-border px-2.5 py-1 text-[11px] font-medium text-text-subtle transition-colors hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  usePageView('ArchivePage', 'Archive page opened', { projectId: id });
  const slug = useCurrentSlug() ?? '';
  const { data: project, isLoading, error, refetch } = useProject(id);
  const role = useCurrentRole();
  const canManage = role === 'owner' || role === 'admin' || role === 'project_manager';

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="h-10 animate-pulse bg-surface-sunken border-b border-border" />
        <div className="px-4 sm:px-6 py-6">
          <div className="h-5 w-32 animate-pulse rounded bg-surface-sunken mb-4" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-72 animate-pulse rounded-lg bg-surface-sunken" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load project" onRetry={refetch} />;
  }
  if (!project) return null;

  const archived = project.sprints.filter(s => s.archivedAt !== null);
  const totalTickets = archived.reduce((sum, s) => sum + s.tickets.length, 0);

  return (
    <div className="flex flex-col">
      {/* No ProjectSubNav on this page — the SubNav only carries the
          assignee + type filters, and neither filters anything on the
          archive view (this page shows archived SPRINTS, not tickets).
          Rendering it left the user with non-functional filter chips at
          the top of the page. */}

      <div className="px-4 sm:px-6 py-6 flex flex-col gap-5">

        {/* Header — project chip + count summary */}
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: projectColor(project.key) }}
          >
            {project.key[0]}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Archive size={14} className="text-text-placeholder" />
              <h1 className="text-lg font-semibold text-text">Archive</h1>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-text-placeholder">
                {archived.length} sprint{archived.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-text-placeholder">
              <Link href={orgRoute(slug, `/projects/${id}/overview`)} className="hover:text-text-subtle hover:underline">
                {project.name}
              </Link>
              {' · '}{totalTickets} ticket{totalTickets === 1 ? '' : 's'} archived
              {' · '}
              <Link href={orgRoute(slug, `/projects/${id}/sprints`)} className="text-text-link hover:underline">
                Active sprints →
              </Link>
            </p>
          </div>
        </div>

        {archived.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface-raised py-12 text-center">
            <Archive size={28} className="text-border" />
            <p className="text-sm font-medium text-text">{MESSAGES.archive.noCompletedSprints.title}</p>
            <p className="max-w-xs text-xs text-text-placeholder">{MESSAGES.archive.noCompletedSprints.description}</p>
            <Link
              href={orgRoute(slug, `/projects/${id}/sprints`)}
              className="mt-1 rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:border-primary/40 hover:text-text"
            >
              View active sprints →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {archived.map(sprint => (
              <ArchivedSprintCard
                key={sprint.id}
                projectId={id}
                sprint={sprint}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
