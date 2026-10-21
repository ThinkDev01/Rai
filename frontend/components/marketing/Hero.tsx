'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from '@/lib/icons';
import { KanbanMockup } from './KanbanMockup';
import { HERO } from '@/content/marketing';

/**
 * Landing-page hero.
 *
 * Composition:
 *   - Animated gradient orbs (decorative, GPU-only transforms)
 *   - Faint dot/grid backdrop (CSS, masked into a vignette)
 *   - Eyebrow chip with subtle pulse dot
 *   - Headline broken into word-spans for the staggered rise animation
 *   - Subhead + dual CTA (Get started / Pricing)
 *   - Floating kanban mockup beneath the copy
 *
 * Copy lives in `frontend/content/marketing.ts` (HERO export). Edit that file
 * to rewrite the headline / subhead / CTAs — no JSX changes needed.
 *
 * Animation budget: 2 floating orbs + N word fades + N card fades. All
 * `transform`/`opacity` only. Reduced-motion users get a static layout
 * thanks to the @media wrap in globals.css.
 */
export function Hero() {
  const words = HERO.headlineWords;
  const lastIdx = words.length - 1;

  return (
    <section className="relative isolate overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* Decorative backdrop — masked grid + two drifting orbs. Behind content. */}
      <div className="bg-grid absolute inset-0 -z-10 opacity-40" aria-hidden="true" />
      <div
        className="anim-orb absolute -top-32 -right-24 -z-10 h-[480px] w-[480px] rounded-full opacity-60 blur-3xl"
        style={{
          background: 'radial-gradient(closest-side, var(--color-primary) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div
        className="anim-orb-slow absolute -bottom-40 -left-20 -z-10 h-[440px] w-[440px] rounded-full opacity-50 blur-3xl"
        style={{
          background: 'radial-gradient(closest-side, var(--color-epic) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* Eyebrow chip */}
        <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-primary-subtle bg-primary-subtle/60 px-3 py-1 backdrop-blur">
          <span className="anim-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">{HERO.eyebrow}</span>
        </div>

        {/* Headline — last word renders with a gradient accent. */}
        <h1 className="mx-auto mt-6 max-w-4xl text-center text-4xl font-bold tracking-tight text-text sm:text-5xl md:text-6xl lg:text-7xl">
          {words.map((word, i) => (
            // Space sits BETWEEN the spans, not inside — an inline-block trims
            // its own trailing whitespace, which would club the words together.
            <Fragment key={`${word}-${i}`}>
              <span className="anim-word inline-block" style={{ '--i': i } as React.CSSProperties}>
                {i === lastIdx ? (
                  <span className="bg-gradient-to-r from-primary via-primary-hover to-[color:var(--color-epic)] bg-clip-text text-transparent">
                    {word}
                  </span>
                ) : (
                  word
                )}
              </span>
              {i < lastIdx && ' '}
            </Fragment>
          ))}
        </h1>

        {/* Subhead */}
        <p
          className="anim-word mx-auto mt-6 max-w-2xl text-center text-base text-text-subtle sm:text-lg"
          style={{ '--i': words.length + 1 } as React.CSSProperties}
        >
          {HERO.subhead}
        </p>

        {/* CTAs */}
        <div
          className="anim-word mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ '--i': words.length + 2 } as React.CSSProperties}
        >
          <Link
            href="/auth/register"
            className="cta-sheen group inline-flex h-11 min-w-[170px] items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-text shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover hover:shadow-xl hover:shadow-primary/30"
          >
            <Sparkles size={15} />
            {HERO.primaryCta}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-11 min-w-[150px] items-center justify-center rounded-md border border-border bg-surface-raised px-5 text-sm font-semibold text-text transition-colors hover:bg-surface-sunken"
          >
            {HERO.secondaryCta}
          </Link>
        </div>

        {/* Trust line */}
        <p
          className="anim-word mt-6 text-center text-xs text-text-placeholder"
          style={{ '--i': words.length + 3 } as React.CSSProperties}
        >
          {HERO.trustLine}
        </p>

        {/* Product mockup */}
        <div
          className="anim-word mt-16 sm:mt-20"
          style={{ '--i': words.length + 4 } as React.CSSProperties}
        >
          <KanbanMockup />
        </div>
      </div>
    </section>
  );
}
