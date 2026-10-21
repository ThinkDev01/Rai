'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTokens } from '@/lib/cognito-client';
import { useAuthStore } from '@/store/auth.store';
import { defaultDashboardRoute } from '@/lib/routes';
import { logger } from '@/lib/logger';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { Hero } from '@/components/marketing/Hero';
import { FeaturesGrid } from '@/components/marketing/FeaturesGrid';
import { Workflow } from '@/components/marketing/Workflow';
import { Showcase } from '@/components/marketing/Showcase';
import { CTABanner } from '@/components/marketing/CTABanner';
import { BackToTop } from '@/components/marketing/BackToTop';

/**
 * Root route — Rai marketing landing page.
 *
 * Routing decision tree:
 *   - No tokens                          → show landing page
 *   - Tokens but store not hydrated yet  → hydrate, then re-decide
 *   - Authenticated + memberships        → redirect to default dashboard
 *   - Authenticated + 0 orgs             → redirect to /welcome
 *
 * Anonymous visitors see the marketing site. Signed-in users get bounced
 * straight into the app, matching how Jira / Linear / Notion behave.
 *
 * While the redirect decision is in flight (token check + /me hydrate) we
 * render the landing page — the redirect will replace it before paint
 * settles in most cases, and if hydration is slow the user just sees the
 * landing briefly. Better than a blank-screen flash.
 */
export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { user, memberships, isAuthenticated, isHydrating, hydrateAttempted, hydrate } = useAuthStore();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    // No tokens? Stay on the marketing page — this is the public entry point.
    if (!getTokens()) {
      logger.info('Home', 'No session — showing the public landing page');
      return;
    }
    // Tokens present — hydrate /me, then route the signed-in user into the app.
    if (!user && !isHydrating && !hydrateAttempted) {
      logger.info('Home', 'Signed in — loading your account before routing');
      hydrate();
      return;
    }
    if (isHydrating) return;
    if (!isAuthenticated) {
      // Tokens were present but hydrate failed (rate-limit, network). Don't
      // boot the user back to /auth/login — just leave them on the landing
      // page where the nav's "Log in" button is still one click away.
      logger.info('Home', 'Could not load your account — staying on the landing page');
      return;
    }
    const target = defaultDashboardRoute(memberships, user?.currentOrgId);
    logger.info('Home', 'Signed in — redirecting into the app', { target });
    router.replace(target);
  }, [mounted, user, memberships, isAuthenticated, isHydrating, hydrateAttempted, hydrate, router]);

  return (
    <main className="min-h-screen bg-surface text-text">
      <MarketingNav />
      <Hero />
      <FeaturesGrid />
      <Workflow />
      <Showcase />
      <CTABanner />
      <MarketingFooter />
      <BackToTop />
    </main>
  );
}
