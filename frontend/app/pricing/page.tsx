'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles, Clock } from '@/lib/icons';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { Reveal } from '@/components/marketing/Reveal';
import { BackToTop } from '@/components/marketing/BackToTop';
import { PRICING } from '@/content/marketing';

/**
 * Pricing — Coming Soon.
 *
 * Public marketing page using the same nav + footer as `/`. Single centered
 * card with the placeholder copy, one CTA back to signup. Pricing tiers will
 * replace this card later; the chrome stays.
 *
 * Copy lives in content/marketing.ts (PRICING export).
 */
export default function PricingPage() {
  return (
    <main className="min-h-screen bg-surface text-text">
      <MarketingNav />

      <section className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
        {/* Same decorative backdrop as the hero for visual continuity. */}
        <div className="bg-grid absolute inset-0 -z-10 opacity-40" aria-hidden="true" />
        <div
          className="anim-orb absolute -top-32 left-1/2 -z-10 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background: 'radial-gradient(closest-side, var(--color-primary) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised p-10 text-center shadow-2xl shadow-primary/5 sm:p-14">
              {/* Top chip */}
              <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-primary-subtle bg-primary-subtle/60 px-3 py-1">
                <Clock size={11} className="text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {PRICING.comingSoonChip}
                </span>
              </div>

              <h1 className="mt-6 text-4xl font-bold tracking-tight text-text sm:text-5xl">
                {PRICING.titleLead}{' '}
                <span className="bg-gradient-to-r from-primary via-primary-hover to-[color:var(--color-epic)] bg-clip-text text-transparent">
                  {PRICING.titleAccent}
                </span>
              </h1>

              <p className="mx-auto mt-5 max-w-xl text-base text-text-subtle sm:text-lg">
                {PRICING.subhead}
              </p>

              {/* Feature row */}
              <div className="mx-auto mt-10 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
                {PRICING.bullets.map((item, i) => (
                  <Reveal key={item.label} delayMs={i * 80}>
                    <div className="lift rounded-lg border border-border-subtle bg-surface p-4 text-left">
                      <p className="text-sm font-semibold text-text">{item.label}</p>
                      <p className="mt-1 text-xs text-text-subtle">{item.detail}</p>
                    </div>
                  </Reveal>
                ))}
              </div>

              {/* CTAs */}
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/auth/register"
                  className="cta-sheen group inline-flex h-11 min-w-[200px] items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-text shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover hover:shadow-xl hover:shadow-primary/30"
                >
                  <Sparkles size={15} />
                  {PRICING.primaryCta}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex h-11 min-w-[140px] items-center justify-center rounded-md border border-border bg-surface-raised px-5 text-sm font-semibold text-text transition-colors hover:bg-surface-sunken"
                >
                  {PRICING.secondaryCta}
                </Link>
              </div>

              <p className="mt-6 text-xs text-text-placeholder">
                {PRICING.supportLine.prompt}{' '}
                <a
                  href={`mailto:${PRICING.supportLine.email}`}
                  className="font-medium text-text-link hover:underline"
                >
                  {PRICING.supportLine.email}
                </a>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <MarketingFooter />
      <BackToTop />
    </main>
  );
}
