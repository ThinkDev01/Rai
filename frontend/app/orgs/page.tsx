'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTokens } from '@/lib/cognito-client';
import { useAuthStore } from '@/store/auth.store';
import { defaultDashboardRoute } from '@/lib/routes';

// Bare /orgs - friendly index that picks the right destination for the user
// instead of returning a 404. Mirrors the root `/` page logic:
//   - No tokens         → /auth/login
//   - Authenticated     → /orgs/<default-slug>/dashboard (or /welcome if 0 memberships)
//
// Without this page, /orgs returns Next's default 404 which is a dead-end.

export default function OrgsIndex() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { user, memberships, isAuthenticated, isHydrating, hydrateAttempted, hydrate } = useAuthStore();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!getTokens()) {
      router.replace('/auth/login');
      return;
    }
    if (!user && !isHydrating && !hydrateAttempted) {
      hydrate();
      return;
    }
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace('/auth/login');
      return;
    }
    router.replace(defaultDashboardRoute(memberships, user?.currentOrgId));
  }, [mounted, user, memberships, isAuthenticated, isHydrating, hydrateAttempted, hydrate, router]);

  return null;
}
