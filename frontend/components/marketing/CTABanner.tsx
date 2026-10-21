'use client';

import Link from 'next/link';
import { ArrowRight, Rocket } from '@/lib/icons';
import { Reveal } from './Reveal';
import { CTA } from '@/content/marketing';

/**
 * Final CTA before the footer. One bold headline, two buttons, soft glow.
 * Mirrors the Stripe / Linear "ready to start?" pattern.
 *
 * Copy lives in content/marketing.ts (CTA export).
 */
export function CTABanner() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-gradient-to-br from-primary/8 via-surface-raised to-[color:var(--color-epic)]/8 p-10 text-center sm:p-14">
            {/* Decorative glow */}
            <div
              className="anim-orb absolute -top-24 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
              style={{
                background: 'radial-gradient(closest-side, var(--color-primary) 0%, transparent 70%)',
              }}
              aria-hidden="true"
            />
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <Rocket size={20} />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
              {CTA.title}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-text-subtle">{CTA.subhead}</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/register"
                className="cta-sheen group inline-flex h-11 min-w-[180px] items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-text shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover hover:shadow-xl hover:shadow-primary/30"
              >
                {CTA.primary}
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex h-11 min-w-[150px] items-center justify-center rounded-md border border-border bg-surface-raised px-5 text-sm font-semibold text-text transition-colors hover:bg-surface-sunken"
              >
                {CTA.secondary}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
