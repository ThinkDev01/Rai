'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Menu,
  Moon,
  Sun,
  Search,
  ChevronDown,
  Building2,
  ArrowRightLeft,
  Check,
  Settings,
  User,
  Plus,
} from '@/lib/icons';
import { Logo } from '@/components/Logo';
import { NotificationBell } from '@/components/shell/NotificationBell';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchModal } from '@/components/search/SearchModal';
import { SubscriptionStatusChip } from '@/components/SubscriptionStatusChip';
import { roleChipClass } from '@/lib/role.utils';
import { useAuthStore } from '@/store/auth.store';
import { useThemeStore } from '@/store/theme.store';
import { useUIStore } from '@/store/ui.store';
import { orgColor } from '@/lib/project.utils';
import { orgRoute } from '@/lib/routes';
import { enqueueToast } from '@/lib/toastQueue';
import { logger } from '@/lib/logger';

// Top header. Right cluster = theme toggle + org switcher.
// The org switcher trigger leads with the CURRENT ORG (colored letter square +
// name + slug + chevron), not the user avatar - this is the Vercel / Linear /
// Notion pattern. The dropdown still surfaces account info, but as secondary
// context: orgs are the primary thing this control does. Sign-out lives in the
// sidebar, so this menu is purely "what org am I in / which one do I want?".

export function Header() {
  const user             = useAuthStore(s => s.user);
  const memberships      = useAuthStore(s => s.memberships);
  const { dark, toggle } = useThemeStore();
  const toggleSidebar    = useUIStore(s => s.toggleSidebar);
  const closeSidebar     = useUIStore(s => s.closeSidebar);
  const searchInputRef   = useRef<HTMLInputElement>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // ⌘K / Ctrl-K - desktop focuses the embedded SearchBar; mobile opens the
  // SearchModal sheet. Matches v1 UX.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.matchMedia('(min-width: 768px)').matches) {
          searchInputRef.current?.focus();
        } else {
          setMobileSearchOpen(true);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-30 h-14 border-b border-border bg-surface-raised">
      <div className="flex h-full items-center px-4">

        {/* Left - hamburger (mobile) + Logo */}
        <div className="flex items-center gap-2 md:w-44 md:flex-shrink-0">
          <button
            onClick={toggleSidebar}
            className="md:hidden flex h-8 w-8 cursor-pointer items-center justify-center rounded text-text-placeholder transition-colors hover:bg-surface hover:text-text"
            aria-label="Toggle menu"
          >
            <Menu size={18} />
          </button>
          <Logo size={28} />
        </div>

        {/* Center - desktop SearchBar (org-scoped via backend). On mobile the
            inline button is gone; a floating FAB at the bottom-right (below)
            takes its place so the top nav has room for the right cluster. */}
        <div className="hidden md:block flex-1 px-4">
          <div className="max-w-md mx-auto">
            <SearchBar inputRef={searchInputRef} />
          </div>
        </div>

        {mobileSearchOpen && <SearchModal onClose={() => setMobileSearchOpen(false)} />}

        {/* Right - theme + notifications + avatar menu. Auto-closes the
            mobile drawer on any tap except the theme toggle (theme is a
            stateless toggle the user might flip while the drawer is open;
            other buttons either open another surface or change context, so
            an open drawer would obscure them). */}
        <div className="ml-auto flex items-center justify-end gap-2">
          <button
            onClick={toggle}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-8 w-8 cursor-pointer touch-manipulation items-center justify-center rounded-full text-text-placeholder transition-colors hover:bg-surface hover:text-text"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Notification bell + unread badge + inbox dropdown (Phase 3).
              Closes the mobile drawer on open so the panel isn't obscured. */}
          <NotificationBell onOpenChange={closeSidebar} />

          {user && (
            <>
              <div className="h-5 w-px bg-border" />
              <OrgSwitcher user={user} memberships={memberships} closeSidebar={closeSidebar} />
            </>
          )}
        </div>

      </div>

      {/* Floating search FAB - mobile only. Sits above the footer (pb-9 in
          layout = 36px footer height; bottom-12 puts FAB just above). z-30
          matches the header, below the mobile drawer (z-40) so the drawer
          covers it cleanly when open. Tap closes the drawer + opens search. */}
      <button
        onClick={() => { closeSidebar(); setMobileSearchOpen(true); }}
        className="md:hidden fixed bottom-12 right-4 z-30 flex h-12 w-12 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Search"
      >
        <Search size={18} />
      </button>
    </header>
  );
}

// ── Org switcher (org-led trigger → switcher + account context) ─────────────
function OrgSwitcher({ user, memberships, closeSidebar }: {
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  memberships: ReturnType<typeof useAuthStore.getState>['memberships'];
  closeSidebar: () => void;
}) {
  const [open, setOpen]   = useState(false);
  const menuRef           = useRef<HTMLDivElement>(null);

  const current      = memberships.find(m => m.org_id === user.currentOrgId);
  const otherOrgs    = memberships.filter(m => m.org_id !== user.currentOrgId);
  const hasOthers    = otherOrgs.length > 0;

  // Org switch = FULL PAGE RELOAD via window.location.assign. Failsafe:
  // wipes React Query cache, zustand state, and every in-flight effect that
  // could race the switch. SPA navigation (router.push) had a window where
  // the new orgId hadn't propagated through zustand → useProjects() cache
  // key → queryKey mismatch → dashboard showed previous org's projects.
  // Full reload is ~500ms slower but guaranteed correct; org switch is rare.
  //
  // Toast success is enqueued via sessionStorage (lib/toastQueue.ts) so it
  // survives the reload and fires AFTER the destination dashboard mounts -
  // matches the "ensure UI reflects change before showing success" UX rule.
  //
  // Cognito `custom:current_org_id` write happens continuously in the org
  // layout's slug-mirror effect; arriving at the new URL re-fires it for the
  // new org. No need to write here.
  function switchOrg(targetOrgId: string) {
    const target = memberships.find(m => m.org_id === targetOrgId);
    if (!target) {
      logger.warn('Header', 'Tried to switch to an org you no longer belong to — ignoring', {
        userId: user.id, targetOrgId,
      });
      return;
    }
    logger.info('Header', 'Switching organization (full page reload)', {
      userId: user.id, fromOrgId: user.currentOrgId, toOrgId: target.org_id, toSlug: target.org_slug,
    });
    enqueueToast({ kind: 'success', message: `Switched to ${target.org_name}` });
    window.location.assign(orgRoute(target.org_slug, '/dashboard'));
  }

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown',   handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown',   handleKey);
    };
  }, [open]);

  // Trigger leads with the current org (Vercel / Linear / Notion pattern):
  //   [colored Building2 square] [Org Name / @slug] [chevron]
  // The square uses a deterministic palette color keyed off the org slug - so
  // every org has a stable visual identity across the entire UI (matches the
  // colored squares we'll show on each row inside the dropdown). The icon
  // inside is `Building2`, the universal "organization" glyph - more
  // suggestive than a bare initial. Color carries per-org identity; icon
  // carries semantic category ("this is an org"). The user avatar is
  // intentionally NOT on the trigger: this control is the org switcher, and
  // account info is secondary context inside the menu. Sign-out lives in the
  // sidebar.
  const orgFill     = current ? orgColor(current.org_slug) : '#6554C0';
  const tooltip     = current
    ? `${current.org_name} (@${current.org_slug}) · click to switch organization`
    : 'Open organization menu';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => { closeSidebar(); setOpen(o => !o); }}
        title={tooltip}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `Organization menu - currently in ${current.org_name}` : 'Open organization menu'}
        className="flex h-9 max-w-[220px] cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-raised pl-1 pr-2 outline-none transition-all duration-150 hover:border-primary/40 hover:shadow-sm focus-visible:border-primary/60"
      >
        {/* Colored Building2 square - primary "this is an org" signal.
            Icon carries semantic category; per-org color carries identity. */}
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-white shadow-sm"
          style={{ backgroundColor: orgFill }}
          aria-hidden
        >
          <Building2 size={15} strokeWidth={2.25} />
        </span>

        {/* Org name + slug - visible on md+ for explicit "you're in org X"
            copy. On mobile only the square + chevron show. */}
        {current && (
          <span className="hidden min-w-0 flex-col items-start leading-tight md:flex">
            <span className="max-w-[140px] truncate text-[12px] font-semibold text-text">
              {current.org_name}
            </span>
            <span className="max-w-[140px] truncate text-[10px] text-text-placeholder">
              @{current.org_slug}
            </span>
          </span>
        )}

        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-text-placeholder transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
        >
          {/* Current org card - full-width, colored accent, role + sub status.
              Inner rows use flex-wrap so long org/role names break to a new
              line instead of forcing horizontal scroll inside the dropdown. */}
          {current && (
            <div className="border-b border-border bg-primary-subtle/30 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                  style={{ backgroundColor: orgFill }}
                  aria-hidden
                >
                  <Building2 size={20} strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-primary/80">
                    Current organization
                  </p>
                  <p className="mt-0.5 break-words text-sm font-semibold text-text">
                    {current.org_name}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-placeholder">
                    <span className="break-all">@{current.org_slug}</span>
                    <SubscriptionStatusChip status={current.subscription_status} size="xs" />
                  </p>
                  {/* Role display: renamed label + underlying type chip,
                      wrap to next line on overflow. The type chip is the
                      load-bearing signal - renamed labels can be anything
                      ("Founder", "Designer"); the type tells you which
                      permission tier the user holds. */}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                    <span className="break-words text-text-subtle">
                      {current.role_label ?? current.role.replace('_', ' ')}
                    </span>
                    <span className={roleChipClass(current.role, 'sm')}>
                      {current.role}
                    </span>
                  </p>
                </div>
                <Check size={16} className="flex-shrink-0 mt-1 text-primary" aria-hidden />
              </div>
            </div>
          )}

          {/* Switcher - other orgs. Each row is a vertical stack:
                Line 1: org name (truncates with ellipsis)
                Line 2: @slug + role chip (wraps if long)
              No horizontal scroll - long role names wrap to a new line
              instead. Vertical scroll on the list uses the slim
              scrollbar-subtle class. */}
          {hasOthers && (
            <div className="py-1.5">
              <div className="flex items-center gap-1.5 px-4 pt-2 pb-1.5">
                <ArrowRightLeft size={12} className="text-text-placeholder" aria-hidden />
                <p className="text-[10px] uppercase tracking-widest text-text-placeholder">
                  Switch organization
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto overflow-x-hidden scrollbar-subtle">
                {otherOrgs.map(m => {
                  const fill = orgColor(m.org_slug);
                  return (
                    <button
                      key={m.org_id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        switchOrg(m.org_id);
                      }}
                      className="flex w-full cursor-pointer items-start gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-surface"
                    >
                      <span
                        className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white shadow-sm"
                        style={{ backgroundColor: fill }}
                        aria-hidden
                      >
                        <Building2 size={16} strokeWidth={2.25} />
                      </span>
                      {/* 3-line stack — same shape for every row regardless
                          of role-label length. Mirrors the current-org card
                          above so the dropdown reads as one consistent rhythm:
                            Line 1: org name
                            Line 2: @slug
                            Line 3: role label · [role chip]
                          Long custom labels wrap to a new line within Line 3;
                          short labels still sit on Line 3 with the chip
                          beside them. No horizontal jitter between rows. */}
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                        <span className="w-full truncate text-text">{m.org_name}</span>
                        <span className="w-full truncate text-xs text-text-placeholder">
                          @{m.org_slug}
                        </span>
                        <span className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                          <span className="break-words capitalize text-text-subtle">
                            {m.role_label ?? m.role.replace('_', ' ')}
                          </span>
                          <span className={`flex-shrink-0 ${roleChipClass(m.role, 'sm')}`}>
                            {m.role}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Create another org - entry point for users who already belong to
              one or more orgs but want to spin up a separate one. Routes to
              /welcome?create=1&from=<current-slug> so welcome renders the
              create-form directly + the back link returns the user here. */}
          <Link
            href={current
              ? `/welcome?create=1&from=${encodeURIComponent(current.org_slug)}`
              : '/welcome?create=1'}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-text-subtle transition-colors hover:bg-surface hover:text-text"
          >
            <Plus size={14} className="text-text-placeholder" aria-hidden />
            <span>Create new organization</span>
          </Link>

          {/* Account context - secondary section: who is signed in, what
              email, verified status. Sign-out lives in the sidebar, so it's
              not duplicated here (single source of truth for destructive
              account actions). */}
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-1.5 pb-1.5">
              <User size={12} className="text-text-placeholder" aria-hidden />
              <p className="text-[10px] uppercase tracking-widest text-text-placeholder">
                Signed in as
              </p>
            </div>
            <p className="truncate text-sm font-medium text-text">
              {user.name?.trim() || user.email}
            </p>
            {user.name?.trim() && (
              <p className="truncate text-xs text-text-subtle">{user.email}</p>
            )}
            <p className="mt-0.5 text-xs text-text-placeholder">
              {user.emailVerified ? '✓ Email verified' : 'Email not yet verified'}
            </p>
          </div>

          {/* Footer action - link to account/org settings. Keeps the dropdown
              feeling like a complete control surface (not a dead-end list). */}
          <Link
            href={current ? orgRoute(current.org_slug, '/settings') : '/'}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-text-subtle transition-colors hover:bg-surface hover:text-text"
          >
            <Settings size={14} className="text-text-placeholder" aria-hidden />
            <span>Account & organization settings</span>
          </Link>
        </div>
      )}
    </div>
  );
}

