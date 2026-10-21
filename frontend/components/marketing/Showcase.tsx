'use client';

import { Check } from '@/lib/icons';
import { Reveal } from './Reveal';
import { SHOWCASE } from '@/content/marketing';

/**
 * Two alternating product-screenshot rows.
 * Each "screenshot" is a small CSS mockup (a ticket detail panel, a sprint
 * burndown). Together with the hero kanban, they cover the three things
 * users see most in a PM tool: board, ticket detail, sprint report.
 */
export function Showcase() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* Row 1 — Ticket detail */}
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{SHOWCASE.tickets.eyebrow}</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
                {SHOWCASE.tickets.title}
              </h2>
              <p className="mt-4 text-base text-text-subtle">
                {SHOWCASE.tickets.subhead}
              </p>
              <ul className="mt-6 space-y-2.5">
                {SHOWCASE.tickets.bullets.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-text-subtle">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
                      <Check size={11} strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delayMs={120}>
            <TicketMock />
          </Reveal>
        </div>

        {/* Row 2 — Sprint report */}
        <div className="mt-24 grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16 sm:mt-32">
          <Reveal delayMs={120} className="lg:order-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{SHOWCASE.sprints.eyebrow}</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
                {SHOWCASE.sprints.title}
              </h2>
              <p className="mt-4 text-base text-text-subtle">
                {SHOWCASE.sprints.subhead}
              </p>
              <ul className="mt-6 space-y-2.5">
                {SHOWCASE.sprints.bullets.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-text-subtle">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
                      <Check size={11} strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal className="lg:order-1">
            <SprintMock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function TicketMock() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-2xl shadow-primary/5 ring-1 ring-black/5">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2 text-[11px] font-mono text-text-placeholder">
          <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: 'var(--color-story)' }} />
          RAI-139 · Story
        </div>
        <h3 className="mt-1.5 text-base font-semibold text-text">
          Critical-error alert pipeline (RF-8)
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-sm bg-primary-subtle px-1.5 text-[10px] font-semibold text-primary">In progress</span>
          <span className="inline-flex h-5 items-center rounded-sm bg-surface-sunken px-1.5 text-[10px] font-medium text-text-subtle">Sprint 12</span>
          <span className="inline-flex h-5 items-center rounded-sm bg-surface-sunken px-1.5 text-[10px] font-medium text-text-subtle">5 pts</span>
          <span className="inline-flex h-5 items-center rounded-sm bg-warning-subtle px-1.5 text-[10px] font-semibold text-warning">High</span>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-border-subtle bg-surface p-3">
            <div className="mb-1 flex items-center gap-2 text-[11px]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0052CC] text-[9px] font-bold text-white">DV</span>
              <span className="font-semibold text-text">Diptanshu</span>
              <span className="text-text-placeholder">· 2h ago</span>
            </div>
            <p className="text-[12px] text-text-subtle">
              CloudWatch alarm wired. SNS topic created. Email subscription pending verification.
            </p>
          </div>
          <div className="rounded-md border border-border-subtle bg-surface p-3">
            <div className="mb-1 flex items-center gap-2 text-[11px]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#6554C0] text-[9px] font-bold text-white">AK</span>
              <span className="font-semibold text-text">Aman</span>
              <span className="text-text-placeholder">· 30m ago</span>
            </div>
            <p className="text-[12px] text-text-subtle">
              Confirmed on staging. Pager hit{' '}
              <span className="rounded-sm bg-primary-subtle px-1 text-primary">@diptanshu</span>{' '}
              in 14s.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-border bg-surface px-3 py-2">
          <span className="text-[11px] text-text-placeholder">Write a comment…</span>
          <span className="anim-caret h-3 w-px bg-text" />
        </div>
      </div>
    </div>
  );
}

function SprintMock() {
  // Burndown chart — pure SVG. Two paths (ideal vs actual) and a faint grid.
  // Numbers are visually plausible, not from an API.
  return (
    <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-2xl shadow-primary/5 ring-1 ring-black/5">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-text">Sprint 12 — Burndown</h3>
            <p className="text-[11px] text-text-placeholder">Apr 22 – May 03 · 8 days remaining</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] text-text-subtle">
              <span className="h-2 w-3 rounded-sm bg-border" /> Ideal
            </div>
            <div className="flex items-center gap-1 text-[10px] text-text-subtle">
              <span className="h-2 w-3 rounded-sm bg-primary" /> Actual
            </div>
          </div>
        </div>

        <div className="mt-4">
          <svg viewBox="0 0 400 180" className="h-44 w-full" preserveAspectRatio="none">
            {/* Grid lines */}
            {[0, 45, 90, 135, 180].map(y => (
              <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" />
            ))}
            {/* Ideal — dashed straight diagonal */}
            <line
              x1="0" y1="0" x2="400" y2="160"
              stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="4 4"
            />
            {/* Actual — slight scope-add bump then steady descent */}
            <path
              d="M 0 0 L 50 15 L 90 40 L 130 35 L 180 65 L 230 95 L 280 110 L 330 130 L 400 145"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Area fill under actual */}
            <path
              d="M 0 0 L 50 15 L 90 40 L 130 35 L 180 65 L 230 95 L 280 110 L 330 130 L 400 145 L 400 180 L 0 180 Z"
              fill="var(--color-primary)"
              opacity="0.08"
            />
            {/* Dot on the latest point */}
            <circle cx="330" cy="130" r="4" fill="var(--color-primary)" />
            <circle cx="330" cy="130" r="8" fill="var(--color-primary)" opacity="0.2" />
          </svg>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Committed', value: '42 pts' },
            { label: 'Completed', value: '28 pts' },
            { label: 'Carry-over', value: '4 pts' },
          ].map(stat => (
            <div key={stat.label} className="rounded-md bg-surface p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-text-placeholder">{stat.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-text">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
