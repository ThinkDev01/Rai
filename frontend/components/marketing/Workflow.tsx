'use client';

import { Reveal } from './Reveal';
import { WORKFLOW } from '@/content/marketing';

/**
 * Three-step "how it works" section.
 * Each step reveals on scroll with a small stagger.
 * A vertical connector line ties them together on desktop.
 *
 * All copy lives in content/marketing.ts (WORKFLOW export).
 */
export function Workflow() {
  return (
    <section className="relative py-24 sm:py-32 bg-surface-sunken/40">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {WORKFLOW.eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              {WORKFLOW.title}
            </h2>
            <p className="mt-4 text-base text-text-subtle">{WORKFLOW.subhead}</p>
          </div>
        </Reveal>

        <div className="relative mt-16 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {/* Connector — only visible on desktop, sits behind the cards. */}
          <div
            className="absolute left-0 right-0 top-12 hidden md:block -z-10"
            aria-hidden="true"
          >
            <div className="mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          {WORKFLOW.steps.map((step, i) => (
            <Reveal key={step.num} delayMs={i * 120}>
              <div className="lift relative h-full rounded-xl border border-border-subtle bg-surface-raised p-6 text-center transition-colors hover:border-primary/40">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle font-mono text-sm font-bold text-primary">
                  {step.num}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-text">{step.title}</h3>
                <p className="text-sm leading-relaxed text-text-subtle">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
