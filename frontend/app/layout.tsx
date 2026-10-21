import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { AuthProvider } from '../providers/AuthProvider';
import QueryProvider from '../providers/QueryProvider';
import { CrossTabSync } from '../components/CrossTabSync';
import { FeedbackPrompt } from '../components/feedback/FeedbackPrompt';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Rai',
  description: 'Lightweight sprint & task management',
  icons: {
    // Badge favicon: white mark on a solid blue rounded square — stays bright
    // and legible at 16px on any tab background (the transparent mark looked
    // dull on dark tab bars). SVG scales to every size, so it's the only
    // source needed for modern browsers.
    icon: [
      { url: '/icon-badge.svg', type: 'image/svg+xml' },
    ],
  },
};

// Theme-init script — runs SYNCHRONOUSLY in <head> before React hydrates.
// Reads the zustand persist payload (rai-theme) and applies the `dark` class
// to <html> so the page paints in the correct theme on first frame. Without
// this, dark-mode users see a ~1s flash of the light theme on hard refresh
// while React mounts and runs the useEffect that toggles the class.
//
// The pattern is the same one next-themes / shadcn / Linear use. Must be
// inline (no external src) and synchronous (no defer/async) so it executes
// before the browser commits the first paint.
//
// Failure is silent — if localStorage is blocked, JSON is corrupt, or the
// stored shape changes, we fall through to the default (light) theme.
const themeInitScript = `
try {
  var s = localStorage.getItem('rai-theme');
  if (s && JSON.parse(s).state && JSON.parse(s).state.dark) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`.trim();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <QueryProvider>
          <AuthProvider>
            {/* Global cross-tab sync - listens for cross-tab sign-out and
                account-swap events on EVERY page (not just /orgs/[slug]/*)
                so the banner persists across page refresh anywhere. */}
            <CrossTabSync />
            {children}
            {/* Self-gating: only fires for signed-in users, after 20 days of
                use, recurring once every 20 days. Mounted here so it shows on
                any app page, not just the dashboard. */}
            <FeedbackPrompt />
          </AuthProvider>
        </QueryProvider>
        {/* Bottom-right with an offset above the fixed footer (h-9 = 36px + padding).
            Industry default for product UIs - Linear, Stripe, GitLab, Airtable,
            Discord all park transactional toasts here. Stays clear of the
            header's avatar/dark-mode cluster AND the sidebar; pushes up off
            the footer so the "Made by Novetum" line never gets covered. */}
        <Toaster position="bottom-right" richColors closeButton offset={52} />
      </body>
    </html>
  );
}
