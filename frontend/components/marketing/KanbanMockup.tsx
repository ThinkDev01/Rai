'use client';

import { useEffect, useState } from 'react';
import { KANBAN_MOCK_CHROME } from '@/content/marketing';

/**
 * Pure-CSS kanban board mockup used as the hero visual.
 *
 * - Three columns (To do / In progress / Done) — matches Rai's actual UI tokens.
 * - Cards mount with a staggered `anim-card` rise (--i delay per card).
 * - One card animates across columns on a slow loop so the board feels alive
 *   without dominating attention. The motion is a single transform on a single
 *   element — cheap.
 * - Dark-mode aware via CSS vars; nothing hardcoded.
 *
 * No images, no external assets. This is the "honest mock" we ship to the
 * marketing page until real product screenshots are recorded.
 */

interface CardSpec {
  id: string;
  title: string;
  type: 'task' | 'story' | 'bug' | 'epic';
  priority: 'high' | 'med' | 'low';
  assignee: string;
  assigneeColor: string;
  points: number;
}

const TODO_CARDS: CardSpec[] = [
  { id: 'RAI-142', title: 'Surface tenant slug in org switcher', type: 'task',  priority: 'high', assignee: 'AK', assigneeColor: '#6554C0', points: 3 },
  { id: 'RAI-148', title: 'Migrate to Cognito refresh-token rotation', type: 'epic', priority: 'high', assignee: 'JS', assigneeColor: '#00B8D9', points: 8 },
  { id: 'RAI-151', title: 'Empty-state illustration for /projects', type: 'task',  priority: 'low',  assignee: 'MR', assigneeColor: '#FF8B00', points: 2 },
];

const IN_PROGRESS_CARDS: CardSpec[] = [
  { id: 'RAI-139', title: 'Critical-error alert pipeline (RF-8)', type: 'story', priority: 'high', assignee: 'DV', assigneeColor: '#0052CC', points: 5 },
  { id: 'RAI-144', title: 'Long-list show-more pagination', type: 'task', priority: 'med', assignee: 'AK', assigneeColor: '#6554C0', points: 3 },
];

const DONE_CARDS: CardSpec[] = [
  { id: 'RAI-128', title: 'Cognito user-pool migration', type: 'epic', priority: 'high', assignee: 'DV', assigneeColor: '#0052CC', points: 13 },
  { id: 'RAI-133', title: 'Settings view→edit→save pattern', type: 'story', priority: 'med', assignee: 'JS', assigneeColor: '#00B8D9', points: 5 },
  { id: 'RAI-136', title: 'Multi-org seed for stress tests', type: 'task',  priority: 'low', assignee: 'MR', assigneeColor: '#FF8B00', points: 2 },
];

function TypeDot({ type }: { type: CardSpec['type'] }) {
  const color =
    type === 'task'  ? 'var(--color-task)'  :
    type === 'story' ? 'var(--color-story)' :
    type === 'bug'   ? 'var(--color-bug)'   :
                       'var(--color-epic)';
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 rounded-[2px]"
      style={{ backgroundColor: color }}
    />
  );
}

function PriorityFlame({ priority }: { priority: CardSpec['priority'] }) {
  const color =
    priority === 'high' ? 'var(--color-priority-high)' :
    priority === 'med'  ? 'var(--color-priority-medium)' :
                          'var(--color-priority-low)';
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-2.5C8 9 7 11 7 13a5 5 0 0010 0c0-5-5-11-5-11z"
        fill={color}
      />
    </svg>
  );
}

function Card({ card, index }: { card: CardSpec; index: number }) {
  return (
    <div
      className="anim-card group rounded-md border border-border-subtle bg-surface-raised p-3 shadow-sm transition-colors hover:border-border"
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-mono text-text-placeholder">
        <TypeDot type={card.type} />
        {card.id}
      </div>
      <p className="text-[12px] font-medium text-text leading-snug line-clamp-2">
        {card.title}
      </p>
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PriorityFlame priority={card.priority} />
          <span className="inline-flex h-4 items-center rounded-sm bg-surface-sunken px-1.5 text-[10px] font-medium text-text-subtle">
            {card.points}
          </span>
        </div>
        <div
          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ backgroundColor: card.assigneeColor }}
        >
          {card.assignee}
        </div>
      </div>
    </div>
  );
}

interface ColumnProps {
  title: string;
  count: number;
  accent: string;
  cards: CardSpec[];
  startDelay: number;
}

function Column({ title, count, accent, cards, startDelay }: ColumnProps) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg bg-surface-sunken/70 p-2.5">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full anim-pulse-dot"
            style={{ backgroundColor: accent }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
            {title}
          </span>
        </div>
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-surface-raised px-1 text-[10px] font-semibold text-text-subtle">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((c, i) => (
          <Card key={c.id} card={c} index={startDelay + i} />
        ))}
      </div>
    </div>
  );
}

export function KanbanMockup() {
  // Mount-gated so SSR doesn't try to render the animated layer before
  // hydration. Avoids a noisy first-paint flash on slow devices.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="relative w-full">
      {/* Browser-chrome frame so the mockup reads as a product screenshot. */}
      <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-2xl shadow-primary/10 ring-1 ring-black/5">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border-subtle bg-surface px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <div className="ml-3 flex h-5 max-w-[260px] items-center gap-1.5 rounded-md bg-surface-sunken px-2 text-[10px] font-mono text-text-placeholder">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9V6a6 6 0 1112 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <rect x="4" y="9" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
            </svg>
            {KANBAN_MOCK_CHROME.urlBar}
          </div>
        </div>

        {/* Toolbar — sprint name + filter chips */}
        <div className="flex items-center justify-between border-b border-border-subtle bg-surface-raised px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-semibold text-text">{KANBAN_MOCK_CHROME.sprintLabel}</span>
            <span className="text-text-placeholder">·</span>
            <span className="text-text-subtle">{KANBAN_MOCK_CHROME.sprintMeta}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-sm bg-surface-sunken px-1.5 text-[10px] font-medium text-text-subtle">
              {KANBAN_MOCK_CHROME.filters.all}
            </span>
            <span className="inline-flex h-5 items-center rounded-sm bg-surface-sunken px-1.5 text-[10px] font-medium text-text-subtle">
              {KANBAN_MOCK_CHROME.filters.me}
            </span>
            <span className="inline-flex h-5 items-center rounded-sm bg-primary-subtle px-1.5 text-[10px] font-semibold text-primary">
              {KANBAN_MOCK_CHROME.filters.addFilter}
            </span>
          </div>
        </div>

        {/* Board */}
        {mounted && (
          <div className="grid grid-cols-3 gap-3 bg-surface px-3 py-3">
            <Column title={KANBAN_MOCK_CHROME.columns.todo}       count={TODO_CARDS.length}        accent="#6B778C" cards={TODO_CARDS}        startDelay={0} />
            <Column title={KANBAN_MOCK_CHROME.columns.inProgress} count={IN_PROGRESS_CARDS.length} accent="#0052CC" cards={IN_PROGRESS_CARDS} startDelay={3} />
            <Column title={KANBAN_MOCK_CHROME.columns.done}       count={DONE_CARDS.length}        accent="#36B37E" cards={DONE_CARDS}        startDelay={5} />
          </div>
        )}
      </div>
    </div>
  );
}
