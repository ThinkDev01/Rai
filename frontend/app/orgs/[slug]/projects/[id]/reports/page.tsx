'use client';

import { use, useState, useEffect, useRef } from 'react';
import { usePageView } from '@/lib/usePageView';
import { ChevronDown, BarChart2, Check } from '@/lib/icons';
import { useProject } from '@/hooks/useProjects';
import { useBurndown, useSprintReport, useVelocity } from '@/hooks/useReports';
import { PageError } from '@/components/ui/PageError';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { isNotFoundError } from '@/lib/errors';
import { formatDate } from '@/lib/dates';
import type { Sprint, BurndownPoint, VelocityPoint, Ticket } from '@/types/api.types';
import { sprintDisplayStatus, SPRINT_PILL_BASE } from '@/lib/sprint.utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface Slice { label: string; value: number; color: string }

// ── Sprint selector (custom dropdown) ────────────────────────────────────────
//
// Native `<select>` can't style individual `<option>`s - the status text
// can't carry the color that matches the pills used elsewhere in the app.
// Custom dropdown lets each row render the sprint name + a real colored
// status pill (same SPRINT_PILL_BASE + sprintDisplayStatus everywhere).
//
// Keyboard interaction:
//   - Escape         → close
//   - Outside click  → close
//   - ↑/↓ arrows     → move focus (browser-default on buttons)
//   - Enter/Space    → select (browser-default on buttons)
// Active sprint gets a Check icon. Selected = same id as `selected.id`.

function SprintSelector({ sprints, selected, onChange }: {
  sprints: Sprint[];
  selected: Sprint;
  onChange: (s: Sprint) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectedDs = sprintDisplayStatus(selected);

  // Outside click + Escape to close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={wrapRef}>
      {/* Trigger - looks like the previous native select, but now carries
          a real colored pill for the current sprint's status. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-raised py-2 pl-3 pr-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:border-primary/40 focus:border-primary focus:outline-none cursor-pointer"
      >
        <span className="truncate max-w-[200px]">{selected.name}</span>
        <span className={`${SPRINT_PILL_BASE} ${selectedDs.pillCls}`}>{selectedDs.label}</span>
        <ChevronDown
          size={14}
          className={`text-text-placeholder transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-30 mt-1.5 w-72 max-h-80 overflow-y-auto scrollbar-subtle rounded-lg border border-border bg-surface-raised shadow-xl py-1"
        >
          {sprints.map(s => {
            const ds       = sprintDisplayStatus(s);
            const isActive = s.id === selected.id;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors
                  ${isActive
                    ? 'bg-primary-subtle text-text font-medium'
                    : 'text-text-subtle hover:bg-surface hover:text-text'
                  }`}
              >
                <span className="flex-1 min-w-0 truncate">{s.name}</span>
                <span className={`flex-shrink-0 ${SPRINT_PILL_BASE} ${ds.pillCls}`}>{ds.label}</span>
                {isActive && (
                  <Check size={13} className="flex-shrink-0 text-primary" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface-raised px-6 py-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">{children}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-placeholder">{sub}</p>}
    </div>
  );
}

// ── Sprint health banner (replaces stat cards) ───────────────────────────────

function SprintHealthBanner({ sprint, removedCount }: { sprint: Sprint; removedCount: number }) {
  const tickets = sprint.tickets;
  const total = tickets.length;
  const done = tickets.filter(t => t.status === 'done').length;
  const inProgress = tickets.filter(t => t.status === 'in_progress').length;
  const inReview = tickets.filter(t => t.status === 'in_review').length;
  const todo = tickets.filter(t => t.status === 'todo').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Stacked progress segments
  const segments = [
    { w: total > 0 ? (done / total) * 100 : 0,       color: 'var(--color-success)', label: 'Done' },
    { w: total > 0 ? (inReview / total) * 100 : 0,    color: 'var(--color-story)',   label: 'Review' },
    { w: total > 0 ? (inProgress / total) * 100 : 0,  color: 'var(--color-warning)', label: 'Active' },
    { w: total > 0 ? (todo / total) * 100 : 0,        color: 'var(--color-border)',  label: 'To Do' },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: big % + label */}
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center">
            <svg width={64} height={64} viewBox="0 0 64 64">
              <circle cx={32} cy={32} r={27} fill="none" style={{ stroke: 'var(--color-border)' }} strokeWidth={6} />
              <circle cx={32} cy={32} r={27} fill="none"
                style={{ stroke: 'var(--color-success)' }} strokeWidth={6}
                strokeDasharray={`${(pct / 100) * 2 * Math.PI * 27} ${2 * Math.PI * 27}`}
                strokeLinecap="round" transform="rotate(-90 32 32)" />
              <text x={32} y={35} textAnchor="middle" fontSize={16} fontWeight="800"
                style={{ fill: 'var(--color-text)' }}>{pct}%</text>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">{done} of {total} completed</p>
            <p className="text-xs text-text-placeholder">
              {formatDate(sprint.startDate)} &rarr; {formatDate(sprint.endDate)}
            </p>
          </div>
        </div>

        {/* Right: status counts */}
        <div className="flex items-center gap-5">
          {[
            { n: done, label: 'Done', color: 'var(--color-success)' },
            { n: inReview, label: 'Review', color: 'var(--color-story)' },
            { n: inProgress, label: 'Active', color: 'var(--color-warning)' },
            { n: todo, label: 'To Do', color: 'var(--color-text-placeholder)' },
            ...(removedCount > 0 ? [{ n: removedCount, label: 'Removed', color: 'var(--color-danger)' }] : []),
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.n}</p>
              <p className="text-[10px] text-text-placeholder">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked progress bar */}
      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
        {segments.map((seg, i) => (
          seg.w > 0 && <div key={i} className="h-full transition-all duration-500" style={{ width: `${seg.w}%`, backgroundColor: seg.color }} />
        ))}
      </div>
    </div>
  );
}

// ── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ slices, title, size = 150 }: { slices: Slice[]; title: string; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">{title}</p>
        <p className="text-sm text-text-placeholder">No data</p>
      </div>
    );
  }
  const R = size * 0.34; const C = 2 * Math.PI * R;
  const cx = size / 2; const cy = size / 2;
  let runningOffset = 0;
  const segments = slices.filter(s => s.value > 0).map(slice => {
    const dash = (slice.value / total) * C;
    const seg = { ...slice, dash, offset: -runningOffset };
    runningOffset += dash;
    return seg;
  });
  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">{title}</p>
      <div className="flex items-center gap-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={R} fill="none" style={{ stroke: 'var(--color-border)' }} strokeWidth={16} />
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {segments.map((seg, i) => (
              <circle key={i} cx={cx} cy={cy} r={R} fill="none"
                style={{ stroke: seg.color }} strokeWidth={16}
                strokeDasharray={`${seg.dash} ${C}`} strokeDashoffset={seg.offset}
              />
            ))}
          </g>
          <text x={cx} y={cy - 3} textAnchor="middle" fontSize={18} fontWeight="700" style={{ fill: 'var(--color-text)' }}>{total}</text>
          <text x={cx} y={cy + 11} textAnchor="middle" fontSize={9} style={{ fill: 'var(--color-text-subtle)' }}>total</text>
        </svg>
        <div className="flex flex-col gap-2">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
              <span className="text-xs text-text-subtle">{seg.label}</span>
              <span className="ml-auto pl-2 text-xs font-semibold text-text">{seg.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Burndown chart ───────────────────────────────────────────────────────────

function BurndownChart({ points, totalTickets, isActive }: {
  points: BurndownPoint[];
  totalTickets: number;
  isActive: boolean;
}) {
  const W = 500; const H = 200;
  const ML = 36; const MR = 16; const MT = 16; const MB = 30;
  const cw = W - ML - MR; const ch = H - MT - MB;
  const maxY = totalTickets || 1; const n = points.length;

  function px(i: number) { return ML + (i / Math.max(n - 1, 1)) * cw; }
  function py(v: number) { return MT + ch - (v / maxY) * ch; }

  const actualPts = points.map((p, i) => `${px(i)},${py(p.remaining)}`).join(' ');
  const idealPts  = points.map((p, i) => `${px(i)},${py(p.ideal)}`).join(' ');
  const fillPts   = `${actualPts} ${px(n - 1)},${py(0)} ${px(0)},${py(0)}`;
  const todayStr  = new Date().toISOString().slice(0, 10);
  const todayIdx  = points.findIndex(p => p.date === todayStr);
  const ySteps    = [...new Set([0, Math.round(maxY / 3), Math.round((maxY * 2) / 3), maxY])];
  const labelInt  = Math.max(1, Math.floor(n / 7));

  return (
    <div>
      {/* Legend sits outside the plot (HTML row above the SVG) so it never
          overlaps the lines when "remaining" is high — same pattern as the
          donut / workload / priority charts. */}
      <div className="mb-1.5 flex items-center justify-end gap-4 text-[10px] text-text-placeholder">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--color-text-disabled)' }} />
          Ideal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2" style={{ borderColor: 'var(--color-primary)' }} />
          Actual
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {ySteps.map(v => (
        <g key={v}>
          <line x1={ML} y1={py(v)} x2={W - MR} y2={py(v)} style={{ stroke: 'var(--color-border)' }} strokeWidth={1} strokeDasharray="4 4" />
          <text x={ML - 5} y={py(v) + 4} textAnchor="end" fontSize={10} style={{ fill: 'var(--color-text-placeholder)' }}>{v}</text>
        </g>
      ))}
      <line x1={ML} y1={MT + ch} x2={W - MR} y2={MT + ch} style={{ stroke: 'var(--color-border)' }} strokeWidth={1} />
      <polyline points={idealPts} fill="none" style={{ stroke: 'var(--color-text-disabled)' }} strokeWidth={1.5} strokeDasharray="6 4" />
      <polygon points={fillPts} style={{ fill: 'var(--color-primary)' }} fillOpacity={0.07} />
      <polyline points={actualPts} fill="none" style={{ stroke: 'var(--color-primary)' }} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.remaining)} r={3} style={{ fill: 'var(--color-primary)' }} />
      ))}
      {isActive && todayIdx >= 0 && (
        <>
          <line x1={px(todayIdx)} y1={MT} x2={px(todayIdx)} y2={MT + ch} style={{ stroke: 'var(--color-danger)' }} strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={px(todayIdx) + 4} y={MT + 11} fontSize={10} style={{ fill: 'var(--color-danger)' }} fontWeight="500">Today</text>
        </>
      )}
      {points.map((p, i) => {
        if (i % labelInt !== 0 && i !== n - 1) return null;
        const d = new Date(p.date + 'T00:00:00');
        return <text key={i} x={px(i)} y={H - 4} textAnchor="middle" fontSize={10} style={{ fill: 'var(--color-text-placeholder)' }}>{d.getDate()}/{d.getMonth() + 1}</text>;
      })}
    </svg>
    </div>
  );
}

// ── Velocity chart ───────────────────────────────────────────────────────────

function VelocityChart({ data }: { data: VelocityPoint[] }) {
  const W = 500; const H = 180;
  const ML = 32; const MR = 12; const MT = 16; const MB = 36;
  const cw = W - ML - MR; const ch = H - MT - MB;
  const maxVal = Math.max(...data.map(d => Math.max(d.committed, d.completed)), 1);
  const groupW = cw / data.length;
  const barW = Math.min(24, groupW * 0.32);
  const gap = 3;

  function py(v: number) { return MT + ch - (v / maxVal) * ch; }
  const ySteps = [...new Set([0, Math.round(maxVal / 2), maxVal])];

  return (
    <div>
      {/* Legend outside the plot so it never sits over the bars. */}
      <div className="mb-1.5 flex items-center justify-end gap-4 text-[10px] text-text-placeholder">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-text-disabled)' }} />
          Committed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-primary)' }} />
          Completed
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {ySteps.map(v => (
        <g key={v}>
          <line x1={ML} y1={py(v)} x2={W - MR} y2={py(v)} style={{ stroke: 'var(--color-border)' }} strokeWidth={1} strokeDasharray="4 3" />
          <text x={ML - 4} y={py(v) + 4} textAnchor="end" fontSize={10} style={{ fill: 'var(--color-text-placeholder)' }}>{v}</text>
        </g>
      ))}
      <line x1={ML} y1={MT + ch} x2={W - MR} y2={MT + ch} style={{ stroke: 'var(--color-border)' }} strokeWidth={1} />
      {data.map((d, i) => {
        const cx = ML + groupW * i + groupW / 2;
        const x1 = cx - barW - gap / 2;
        const x2 = cx + gap / 2;
        const h1 = (d.committed / maxVal) * ch;
        const h2 = (d.completed / maxVal) * ch;
        return (
          <g key={i}>
            <rect x={x1} y={py(d.committed)} width={barW} height={h1} rx={3} style={{ fill: 'var(--color-text-disabled)' }} />
            {d.committed > 0 && <text x={x1 + barW / 2} y={py(d.committed) - 4} textAnchor="middle" fontSize={9} fontWeight="600" style={{ fill: 'var(--color-text-subtle)' }}>{d.committed}</text>}
            <rect x={x2} y={py(d.completed)} width={barW} height={h2} rx={3} style={{ fill: 'var(--color-primary)' }} />
            {d.completed > 0 && <text x={x2 + barW / 2} y={py(d.completed) - 4} textAnchor="middle" fontSize={9} fontWeight="600" style={{ fill: 'var(--color-primary)' }}>{d.completed}</text>}
            <text x={cx} y={H - 14} textAnchor="middle" fontSize={9} style={{ fill: 'var(--color-text-subtle)' }}>
              {d.sprintName.length > 8 ? d.sprintName.slice(0, 7) + '..' : d.sprintName}
            </text>
            <text x={cx} y={H - 3} textAnchor="middle" fontSize={8}
              style={{ fill: d.status === 'completed' ? 'var(--color-success)' : d.status === 'active' ? 'var(--color-primary)' : 'var(--color-text-placeholder)' }}>
              {d.status === 'completed' ? 'Done' : d.status === 'active' ? 'Active' : 'Planned'}
            </text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

// ── Workload by assignee (horizontal bar chart) ──────────────────────────────

function WorkloadChart({ tickets }: { tickets: Ticket[] }) {
  const map = new Map<string, { name: string; done: number; notDone: number }>();
  for (const t of tickets) {
    const name = t.assignee?.name ?? 'Unassigned';
    const key = t.assignee?.id ?? '_unassigned';
    if (!map.has(key)) map.set(key, { name, done: 0, notDone: 0 });
    const entry = map.get(key)!;
    if (t.status === 'done') entry.done++;
    else entry.notDone++;
  }
  const data = [...map.values()].sort((a, b) => (b.done + b.notDone) - (a.done + a.notDone));
  const maxCount = Math.max(...data.map(d => d.done + d.notDone), 1);

  if (data.length === 0) return <p className="text-sm text-text-placeholder">No tickets</p>;

  return (
    <div className="flex flex-col gap-2">
      {/* Scrollable bar list - 50+ assignees would otherwise push the
          card unreadably tall. Cap to ~360px with the slim scrollbar
          treatment so the chrome stays clean. */}
      <div className="flex max-h-[360px] flex-col gap-3 overflow-y-auto scrollbar-subtle pr-1">
        {data.map(d => {
          const total = d.done + d.notDone;
          const donePct = (d.done / maxCount) * 100;
          const notDonePct = (d.notDone / maxCount) * 100;
          return (
            <div key={d.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-text-subtle truncate max-w-[140px]">{d.name}</span>
                <span className="font-semibold text-text">{total}
                  <span className="font-normal text-text-placeholder ml-1">({d.done} done)</span>
                </span>
              </div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
                {donePct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${donePct}%`, backgroundColor: 'var(--color-success)' }} />}
                {notDonePct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${notDonePct}%`, backgroundColor: 'var(--color-warning)' }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-1 text-[10px] text-text-placeholder">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-success" /> Done</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-warning" /> In progress</span>
      </div>
    </div>
  );
}

// ── Priority breakdown (compact visual) ──────────────────────────────────────

function PriorityChart({ tickets }: { tickets: Ticket[] }) {
  const priorities = [
    { label: 'Critical', key: 'critical', color: 'var(--color-danger)' },
    { label: 'High',     key: 'high',     color: '#FF7452' },
    { label: 'Medium',   key: 'medium',   color: 'var(--color-warning)' },
    { label: 'Low',      key: 'low',      color: 'var(--color-success)' },
    { label: 'Lowest',   key: 'lowest',   color: 'var(--color-text-placeholder)' },
  ];
  const total = tickets.length || 1;
  const data = priorities
    .map(p => ({ ...p, count: tickets.filter(t => t.priority === p.key).length }))
    .filter(p => p.count > 0);

  if (data.length === 0) return <p className="text-xs text-text-placeholder">No tickets</p>;

  // Stacked horizontal bar
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-lg bg-surface">
        {data.map(p => {
          const w = (p.count / total) * 100;
          return (
            <div key={p.key} className="h-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
              style={{ width: `${w}%`, backgroundColor: p.color, minWidth: p.count > 0 ? '24px' : 0 }}>
              {w > 8 ? p.count : ''}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map(p => (
          <div key={p.key} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="text-text-subtle">{p.label}</span>
            <span className="font-semibold text-text">{p.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  usePageView('ReportsPage', 'Reports page opened', { projectId: id });
  const { data: project, isLoading, error, refetch } = useProject(id);
  const [selectedSprint, setSelectedSprint] = useState<Sprint | undefined>(undefined);

  useEffect(() => {
    if (project && !selectedSprint) {
      setSelectedSprint(
        project.sprints.find(s => s.status === 'active') ?? project.sprints[0]
      );
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sprintId = selectedSprint?.id;
  const { data: burndown } = useBurndown(id, sprintId);
  const { data: report } = useSprintReport(id, sprintId);
  const { data: velocityData } = useVelocity(id);

  if (isLoading) {
    return (
      <div className="flex flex-col px-4 sm:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div><div className="h-6 w-24 animate-pulse rounded bg-surface-sunken mb-2" /><div className="h-4 w-40 animate-pulse rounded bg-surface-sunken" /></div>
          <div className="h-9 w-40 animate-pulse rounded-lg bg-surface-sunken" />
        </div>
        <div className="h-24 animate-pulse rounded-xl bg-surface-sunken mb-5" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mb-5">
          <div className="lg:col-span-2 h-56 animate-pulse rounded-xl bg-surface-sunken" />
          <div className="h-56 animate-pulse rounded-xl bg-surface-sunken" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-5">
          <div className="h-56 animate-pulse rounded-xl bg-surface-sunken" />
          <div className="h-56 animate-pulse rounded-xl bg-surface-sunken" />
        </div>
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load reports" onRetry={refetch} />;
  }
  if (!project) return null;

  if (!selectedSprint) {
    // Empty state with icon + title + description, matches the dashboard /
    // backlog empty-state look. Previous version was a single line of text
    // pinned to the top - looked unfinished and broke the page rhythm.
    return (
      <div className="px-4 sm:px-8 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-text">Reports</h1>
          <p className="mt-0.5 text-sm text-text-subtle">Sprint analytics &amp; insights</p>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BarChart2 size={32} className="mb-3 text-border" />
          <h2 className="text-base font-semibold text-text">No sprints yet</h2>
          <p className="mt-1.5 max-w-xs text-sm text-text-subtle">
            Reports will populate once you create your first sprint and start tracking work.
          </p>
        </div>
      </div>
    );
  }

  const tickets    = selectedSprint.tickets;
  const total      = tickets.length;
  const done       = tickets.filter(t => t.status === 'done').length;
  const inProgress = tickets.filter(t => t.status === 'in_progress').length;
  const inReview   = tickets.filter(t => t.status === 'in_review').length;
  const todo       = tickets.filter(t => t.status === 'todo').length;

  const removedCount = report?.removed.length ?? 0;

  const typeSlices: Slice[] = [
    { label: 'Task',  value: tickets.filter(t => t.type === 'task').length,  color: 'var(--color-task)'  },
    { label: 'Story', value: tickets.filter(t => t.type === 'story').length, color: 'var(--color-story)' },
    { label: 'Bug',   value: tickets.filter(t => t.type === 'bug').length,   color: 'var(--color-bug)'   },
    { label: 'Epic',  value: tickets.filter(t => t.type === 'epic').length,  color: 'var(--color-epic)'  },
  ];

  const statusSlices: Slice[] = [
    { label: 'Done',        value: done,       color: 'var(--color-success)'          },
    { label: 'In Review',   value: inReview,   color: 'var(--color-story)'            },
    { label: 'In Progress', value: inProgress, color: 'var(--color-warning)'          },
    { label: 'To Do',       value: todo,       color: 'var(--color-text-placeholder)' },
  ];

  const avgCommitted = velocityData && velocityData.length > 0
    ? Math.round(velocityData.reduce((s, d) => s + d.committed, 0) / velocityData.length) : 0;
  const avgCompleted = velocityData && velocityData.length > 0
    ? Math.round(velocityData.reduce((s, d) => s + d.completed, 0) / velocityData.length) : 0;

  return (
    <div className="flex flex-col">
      <div className="px-4 sm:px-8 py-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text">Reports</h1>
            <p className="mt-0.5 text-sm text-text-subtle">Sprint analytics &amp; insights</p>
          </div>
          <SprintSelector sprints={project.sprints} selected={selectedSprint} onChange={setSelectedSprint} />
        </div>

        {/* ── Row 1: Sprint health banner ─────────────────────────────────── */}
        <div className="mb-5">
          <SprintHealthBanner sprint={selectedSprint} removedCount={removedCount} />
        </div>

        {/* ── Row 2: Burndown + Type donut ────────────────────────────────── */}
        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle sub={`${formatDate(selectedSprint.startDate)} \u2192 ${formatDate(selectedSprint.endDate)}`}>
              Burndown - {selectedSprint.name}
            </CardTitle>
            {burndown && burndown.points.length > 0 ? (
              <BurndownChart points={burndown.points} totalTickets={burndown.totalTickets} isActive={selectedSprint.status === 'active'} />
            ) : (
              <div className="flex h-40 items-center justify-center">
                <p className="text-sm text-text-placeholder">No burndown data yet - status changes will appear here</p>
              </div>
            )}
          </Card>
          <Card className="flex items-center justify-center">
            <DonutChart slices={typeSlices} title="Ticket types" />
          </Card>
        </div>

        {/* ── Row 3: Velocity + Status donut ──────────────────────────────── */}
        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle sub="Committed vs completed tickets per sprint">Velocity - all sprints</CardTitle>
            {velocityData && velocityData.length > 0 ? (
              <>
                <VelocityChart data={velocityData} />
                {velocityData.length >= 2 && (
                  <div className="mt-3 flex gap-5 border-t border-border pt-3 text-xs text-text-subtle">
                    <span>Avg committed: <strong className="text-text">{avgCommitted}</strong></span>
                    <span>Avg completed: <strong className="text-text">{avgCompleted}</strong></span>
                    <span>Completion rate: <strong className="text-text">{avgCommitted > 0 ? Math.round((avgCompleted / avgCommitted) * 100) : 0}%</strong></span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-40 items-center justify-center">
                <p className="text-sm text-text-placeholder">No sprint data available</p>
              </div>
            )}
          </Card>
          <Card className="flex items-center justify-center">
            <DonutChart slices={statusSlices} title="Status breakdown" />
          </Card>
        </div>

        {/* ── Row 4: Workload + Priority ───────────────────────────────────── */}
        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle sub="Tickets assigned per team member">Workload by assignee</CardTitle>
            <WorkloadChart tickets={tickets} />
          </Card>
          <Card>
            <CardTitle sub="Distribution across priority levels">Priority breakdown</CardTitle>
            <PriorityChart tickets={tickets} />
          </Card>
        </div>

      </div>
    </div>
  );
}
