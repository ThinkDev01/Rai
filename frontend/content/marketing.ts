/**
 * Marketing — all user-facing copy on the landing page (/) and pricing page
 * (/pricing). Component logic imports these constants instead of holding the
 * strings inline. To rewrite a headline or change a CTA label, edit ONLY this
 * file — no JSX hunting required.
 *
 * Structure mirrors the page sections (top → bottom) so you can scan the
 * landing visually by reading the file:
 *   NAV → HERO → FEATURES → WORKFLOW → SHOWCASE → CTA → FOOTER → PRICING.
 */

// ── Nav ──────────────────────────────────────────────────────────────────────
export const NAV = {
  links: {
    docs:    'Docs',
    pricing: 'Pricing',
    login:   'Log in',
    getStarted: 'Get started',
  },
  themeToggle: {
    toLight: 'Switch to light mode',
    toDark:  'Switch to dark mode',
  },
} as const;

// ── Hero ─────────────────────────────────────────────────────────────────────
export const HERO = {
  eyebrow: 'Now in private beta',
  /** Broken into words for the staggered fade-up animation. The last word is
   *  rendered with a gradient in the component. */
  headlineWords: ['Project', 'management', 'that', 'gets', 'out', 'of', 'your', 'way.'],
  subhead:
    'Sprints, tickets, and team coordination for fast-moving product teams — without the bloat of enterprise PM tools.',
  primaryCta:   'Get started free',
  secondaryCta: 'See pricing',
  trustLine:    'No credit card required',
} as const;

// ── Kanban mockup chrome ─────────────────────────────────────────────────────
// Mockup CARD data (titles, IDs, assignees) stays in the component — it's
// product simulation, not marketing copy. Only the page-chrome labels live
// here so a future Linear-style language refresh doesn't require touching the
// mockup component.
export const KANBAN_MOCK_CHROME = {
  urlBar:       'app.rai.novetum.com/orgs/acme/board',
  sprintLabel:  'Sprint 12',
  sprintMeta:   '8 days left',
  filters: {
    all:       'All',
    me:        'You',
    addFilter: '+ Filter',
  },
  columns: {
    todo:       'To do',
    inProgress: 'In progress',
    done:       'Done',
  },
} as const;

// ── Features grid ────────────────────────────────────────────────────────────
export const FEATURES = {
  eyebrow:  'Everything in one place',
  title:    'The pieces your team actually uses',
  subhead:
    'No 200-feature spec sheet. Just the things teams reach for every day — done well and consistent.',
  /** Order = display order. `iconKey` resolves to a lucide icon at render
   *  time so we keep the icon binding next to the copy. `tone` selects the
   *  accent color via CSS vars. */
  items: [
    {
      iconKey: 'Layers',
      tone:    'epic',
      title:   'Sprints that actually ship',
      body:    'Plan, run, and close iterations without ceremony. Backlog grooming, capacity views, and sprint reports — built in, not bolted on.',
    },
    {
      iconKey: 'GitBranch',
      tone:    'primary',
      title:   'Tickets with real context',
      body:    'Link sub-tickets, mention teammates, attach decisions. Every ticket is a thread, not a checkbox lost in a list.',
    },
    {
      iconKey: 'Users',
      tone:    'story',
      title:   'Built for cross-org teams',
      body:    'One account, many workspaces. Switch organizations in a click — context, permissions, and notifications follow you.',
    },
    {
      iconKey: 'Activity',
      tone:    'success',
      title:   'Honest velocity metrics',
      body:    'Track real throughput, not story-point theater. Sprint health, scope changes, and bottlenecks surface automatically.',
    },
    {
      iconKey: 'Shield',
      tone:    'warning',
      title:   'Security as default',
      body:    'AWS Cognito auth, MFA-ready, audit trails on every state change. SSO via Google and Microsoft out of the box.',
    },
    {
      iconKey: 'Zap',
      tone:    'bug',
      title:   'Fast everywhere',
      body:    'Sub-second navigation, optimistic mutations, keyboard-first. Your tools should not be the slowest thing in your day.',
    },
  ],
} as const;

// ── Workflow / "How it works" ────────────────────────────────────────────────
export const WORKFLOW = {
  eyebrow:  'How it works',
  title:    'From idea to shipped in three moves',
  subhead:
    'We picked the smallest workflow that actually scales. No status meetings to make the tool happy.',
  steps: [
    {
      num:   '01',
      title: 'Plan your sprint',
      body:  'Pull from the backlog, weigh capacity, lock the scope. Drag, drop, done — no spreadsheet round-trips.',
    },
    {
      num:   '02',
      title: 'Ship in the open',
      body:  'Every ticket moves through your board with full history. Mentions, sub-tickets, and decisions live where the work happens.',
    },
    {
      num:   '03',
      title: 'Close the loop',
      body:  'Retros, velocity, and scope creep land in one report. No exporting to slides, no hand-built dashboards.',
    },
  ],
} as const;

// ── Showcase rows ────────────────────────────────────────────────────────────
export const SHOWCASE = {
  tickets: {
    eyebrow: 'Tickets',
    title:   'Every ticket is a conversation, not a form',
    subhead:
      'Threads, mentions, linked sub-tickets, and decisions all live in the same place — so context never gets lost in chat.',
    bullets: [
      'Sub-ticket trees with one-click navigation',
      '@-mentions notify the right person, no spam',
      'Linked tickets keep dependencies obvious',
      'Full audit trail on every state change',
    ],
  },
  sprints: {
    eyebrow: 'Sprints',
    title:   'Honest sprint reports, automatically',
    subhead:
      'See real velocity, scope changes, and what slipped — without anyone exporting CSVs at 11pm on Friday.',
    bullets: [
      'Burndown chart updates as work moves',
      'Scope-change log: who added what, when',
      'Carry-over tracking across sprints',
      'Per-assignee throughput, no judgement built in',
    ],
  },
} as const;

// ── Final CTA banner ─────────────────────────────────────────────────────────
export const CTA = {
  title:    'Ready to ship faster?',
  subhead:  'Set up your workspace in under a minute. Invite your team. Get back to building.',
  primary:  'Get started free',
  secondary:'I already have an account',
} as const;

// ── Marketing footer ─────────────────────────────────────────────────────────
export const FOOTER = {
  /** Static year — JS Date.now() is unavailable in some build contexts.
   *  Bump manually at year-end. */
  year: 2026,
  brand: 'Rai',
  copyrightSuffix: 'Novetum. All rights reserved.',
  credit: {
    prefix: 'Crafted with care by',
    name:   'Novetum',
  },
} as const;

// ── Pricing page (Coming Soon) ───────────────────────────────────────────────
export const PRICING = {
  comingSoonChip: 'Coming soon',
  titleLead:    'Pricing is',
  titleAccent:  'on the way',
  subhead:
    "We're finalising plans for teams of every shape and size. Until then, Rai is free during the private beta — no card, no limits, no traps.",
  bullets: [
    { label: 'Free in beta',  detail: 'Full features, no card' },
    { label: 'Fair pricing',  detail: 'Pay for what you use' },
    { label: 'Team-friendly', detail: 'No per-seat shocks' },
  ],
  primaryCta:   'Start free in beta',
  secondaryCta: 'Back to home',
  supportLine: {
    prompt: 'Questions? Reach us at',
    email:  'support@rai.novetum.com',
  },
} as const;
