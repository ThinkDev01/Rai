'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Moon, Sun, Menu, X, ArrowRight } from '@/lib/icons';
import { useThemeStore } from '@/store/theme.store';
import { NAV } from '@/content/marketing';

/**
 * Sticky top nav for the marketing pages (/, /pricing).
 *
 * Composition (right cluster, in order):
 *   [theme toggle] [Pricing] [Log in] [Get Started]
 *
 * Pricing sits in the right cluster (not the center) per user request — keeps
 * the marketing surface symmetric with how login/signup buttons cluster on
 * most modern SaaS landings (Linear, Vercel, Resend).
 *
 * Background: solid `bg-surface-raised` always — no transparent state, no
 * scroll-blur. The user asked for a fixed look on the nav so the chrome
 * never disappears against the hero. Other landing-page animations stay.
 *
 * Theme handling mirrors components/shell/Header.tsx: read `dark` from the
 * persisted store, apply `.dark` to <html> via effect. Persist is rehydrated
 * automatically by zustand, so visiting the landing page after a dark-mode
 * session inside the app keeps the dark theme.
 */
export function MarketingNav() {
  const { dark, toggle } = useThemeStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Apply persisted theme to <html>. Same pattern as Header.tsx so behavior
  // matches when a user crosses between marketing pages and the app.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Close mobile drawer on Escape so it never traps the user.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onThemeToggle() {
    toggle();
  }

  return (
    <header className="fixed top-0 inset-x-0 z-40 border-b border-border-subtle bg-surface-raised">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        {/* Left — logo */}
        <Logo size={32} />

        {/* Right cluster — theme | Pricing | Log in | Get Started.
            Theme toggle sits left of the divider so it visually reads as a
            chrome control (like the app Header's pattern), not a nav link. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onThemeToggle}
            title={dark ? NAV.themeToggle.toLight : NAV.themeToggle.toDark}
            aria-label="Toggle theme"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Vertical divider separating the theme toggle from nav links.
              Hidden on mobile where the hamburger condenses the right side. */}
          <span className="hidden sm:block h-5 w-px bg-border-subtle" aria-hidden="true" />

          <Link
            href="/docs"
            className="hidden sm:inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
          >
            {NAV.links.docs}
          </Link>

          <Link
            href="/pricing"
            className="hidden sm:inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
          >
            {NAV.links.pricing}
          </Link>

          <Link
            href="/auth/login"
            className="hidden sm:inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
          >
            {NAV.links.login}
          </Link>

          <Link
            href="/auth/register"
            className="cta-sheen group hidden sm:inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-text shadow-sm transition-colors hover:bg-primary-hover"
          >
            {NAV.links.getStarted}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(v => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="sm:hidden flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile slide-down panel */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-border-subtle bg-surface-raised">
          <div className="mx-auto max-w-7xl px-5 py-4 flex flex-col gap-1">
            <Link
              href="/docs"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-sunken"
            >
              {NAV.links.docs}
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-sunken"
            >
              {NAV.links.pricing}
            </Link>
            <Link
              href="/auth/login"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-sunken"
            >
              {NAV.links.login}
            </Link>
            <Link
              href="/auth/register"
              onClick={() => setMobileOpen(false)}
              className="mt-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-text shadow-sm transition-colors hover:bg-primary-hover"
            >
              {NAV.links.getStarted}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
