'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth.store';
import { defaultDashboardRoute } from '@/lib/routes';
import { getTokens } from '@/lib/cognito-client';

interface LogoProps {
  size?: number;
}

/**
 * Brand logo. Acts as a smart home-link:
 *   - Anonymous visitors  → `/` (marketing landing page)
 *   - Signed-in visitors  → their default dashboard route
 *
 * The smart routing matters because the marketing root previously bounced
 * authenticated callers via a client-side redirect — that 200–500ms hop felt
 * laggy. Resolving the href client-side ahead of click lands users directly
 * on their dashboard with no intermediate paint.
 *
 * SSR considerations:
 *   - First render emits `href="/"` so server-side HTML stays stable.
 *   - useEffect updates href once tokens + memberships hydrate.
 *   - The href the user actually clicks is the post-effect value because by
 *     the time the page is interactive, the effect has settled.
 */
export function Logo({ size = 32 }: LogoProps) {
  const user        = useAuthStore(s => s.user);
  const memberships = useAuthStore(s => s.memberships);
  const [href, setHref] = useState<string>('/');

  useEffect(() => {
    // No tokens → marketing landing. Cheap synchronous localStorage read,
    // runs once on mount + whenever the user/memberships slice changes
    // (after sign-in/sign-out or org switch).
    if (!getTokens()) {
      setHref('/');
      return;
    }
    // Tokens present — point at the dashboard the user would land on. Falls
    // back to '/welcome' when they have zero memberships (covered inside
    // defaultDashboardRoute).
    setHref(defaultDashboardRoute(memberships, user?.currentOrgId));
  }, [user?.currentOrgId, memberships]);

  return (
    <Link href={href} className="flex items-center focus:outline-none">
      {/* Full logo (mark + wordmark) from /public. Width derived from the
          asset's native 961×326 aspect ratio so it scales by height alone.
          Two variants swapped via CSS (no flash): the base file has a black
          wordmark for light mode; the -dark file has a white wordmark and is
          shown only when the `dark` class is on <html>. */}
      <Image
        src="/logo-full.svg"
        alt="Rai"
        height={size}
        width={Math.round((size * 961) / 326)}
        priority
        className="block dark:hidden"
      />
      <Image
        src="/logo-full-dark.svg"
        alt="Rai"
        height={size}
        width={Math.round((size * 961) / 326)}
        priority
        className="hidden dark:block"
      />
    </Link>
  );
}
