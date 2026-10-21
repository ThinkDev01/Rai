'use client';

import { useState, useEffect, useMemo, type ComponentType, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import {
  FileQuestion, LayoutDashboard, Lock,
  CreditCard, Smartphone, MessageSquare, UserPlus, User, Bell, Building2, Shield, FolderOpen, Zap, Ticket, ClipboardList,
} from '@/lib/icons';
import { fetchApiDocs, type ApiDocsPayload, type ApiDocCategory, type ApiDocEntry } from '@/lib/apiDocs';
import apiDocsSnapshot from '@/content/apiDocsSnapshot.json';

/**
 * Docs — two sources, same shell, same rendering path:
 *
 *   1. Bundled snapshot (`content/apiDocsSnapshot.json`) — generated once from
 *      rai-backend's Api-Documentation/ folder and shipped with the frontend
 *      build. Renders immediately on load, works with zero backend
 *      dependency, so /docs never shows a reduced view.
 *   2. Live Api-Documentation via GET /api/docs — fetched in the background;
 *      if the backend is reachable, its (potentially fresher) payload
 *      replaces the snapshot. If not, the snapshot already has all 13
 *      categories, so there's no degraded fallback state.
 *
 * The snapshot goes stale the moment someone edits a file under
 * Api-Documentation/ without regenerating it — regenerate by running, from
 * rai-backend: `npx tsx -e "import {apiDocsPayload} from './config/apiDocs';
 * console.log(JSON.stringify(apiDocsPayload))"` and saving the output over
 * rai-frontend/content/apiDocsSnapshot.json.
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-sunken p-4 text-xs leading-relaxed">
      <code className="font-mono text-text">{children}</code>
    </pre>
  );
}

// Styles the raw Markdown coming from Api-Documentation/*.md to match the
// rest of the page. Fenced code blocks route through the same CodeBlock used
// everywhere else on this page; react-markdown v9 dropped the `inline` prop,
// so block vs. inline code is distinguished by overriding `pre` (always the
// fenced-block wrapper) separately from `code` (inline only, once `pre` has
// claimed the block case).
function extractCodeText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractCodeText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractCodeText((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

const markdownComponents = {
  h1: (props: React.ComponentPropsWithoutRef<'h3'>) => <h3 className="mt-6 text-base font-semibold text-text first:mt-0" {...props} />,
  h2: (props: React.ComponentPropsWithoutRef<'h3'>) => <h3 className="mt-6 text-base font-semibold text-text first:mt-0" {...props} />,
  h3: (props: React.ComponentPropsWithoutRef<'h4'>) => <h4 className="mt-4 text-sm font-semibold text-text" {...props} />,
  p: (props: React.ComponentPropsWithoutRef<'p'>) => <p className="text-sm leading-relaxed text-text-subtle" {...props} />,
  ul: (props: React.ComponentPropsWithoutRef<'ul'>) => <ul className="list-disc space-y-1 pl-5 text-sm text-text-subtle" {...props} />,
  ol: (props: React.ComponentPropsWithoutRef<'ol'>) => <ol className="list-decimal space-y-1 pl-5 text-sm text-text-subtle" {...props} />,
  strong: (props: React.ComponentPropsWithoutRef<'strong'>) => <strong className="font-semibold text-text" {...props} />,
  a: (props: React.ComponentPropsWithoutRef<'a'>) => <a className="text-text-link underline hover:no-underline" {...props} />,
  hr: () => <hr className="my-6 border-border-subtle" />,
  pre: ({ children }: { children?: ReactNode }) => <CodeBlock>{extractCodeText(children).replace(/\n$/, '')}</CodeBlock>,
  code: (props: React.ComponentPropsWithoutRef<'code'>) => (
    <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em] text-text" {...props} />
  ),
  table: (props: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props: React.ComponentPropsWithoutRef<'thead'>) => (
    <thead className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-placeholder" {...props} />
  ),
  th: (props: React.ComponentPropsWithoutRef<'th'>) => <th className="px-3 py-2 font-medium" {...props} />,
  td: (props: React.ComponentPropsWithoutRef<'td'>) => <td className="border-b border-border-subtle px-3 py-2 align-top text-text-subtle" {...props} />,
};

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
}

const METHOD_TONE: Record<HttpMethod, string> = {
  GET: 'bg-info-subtle text-info',
  POST: 'bg-success-subtle text-success',
  PUT: 'bg-warning-subtle text-warning',
  PATCH: 'bg-warning-subtle text-warning',
  DELETE: 'bg-danger-subtle text-danger',
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[11px] font-bold ${METHOD_TONE[method]}`}>
      {method}
    </span>
  );
}

interface Section {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  Content: ComponentType;
}

// One card per docs.md + curl.md pair. Deliberately renders the FULL markdown
// body rather than extracting individual fields (Headers/Path Params/Query
// Params/etc. into separate slots) — those source files use two coexisting
// hand-written patterns (single-operation and multi-operation-per-file, e.g.
// billing-api/billing and me-api/pin-project|pin-ticket cover several HTTP
// methods in one doc) that don't reduce to one rigid schema without either
// rewriting ~69 files or silently dropping content. Rendering the source
// faithfully, inside a consistent card/method-badge shell, is the accurate
// choice; see rai-backend/config/apiDocs.ts for the parsing details.

function ApiDocEntryCard({ entry }: { entry: ApiDocEntry }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-5">
      {entry.methods.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {entry.methods.map(({ method, path }) => (
            <span key={`${method}-${path}`} className="inline-flex items-center gap-1.5 rounded bg-surface-sunken px-2 py-1">
              <MethodBadge method={method as HttpMethod} />
              <span className="font-mono text-xs text-text">{path}</span>
            </span>
          ))}
        </div>
      )}
      <h3 className="mt-3 text-base font-semibold text-text">{entry.title}</h3>
      <div className="mt-3">
        <Markdown>{entry.docs}</Markdown>
      </div>
      {entry.curl && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-text">Sample curl</h4>
          <div className="mt-2">
            <Markdown>{entry.curl}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiDocCategoryContent({ category }: { category: ApiDocCategory }) {
  return (
    <div className="flex flex-col gap-4">
      {category.entries.length > 0 ? (
        category.entries.map((entry) => <ApiDocEntryCard key={entry.id} entry={entry} />)
      ) : (
        <p className="text-sm text-text-placeholder">No documented endpoints in this category yet.</p>
      )}
    </div>
  );
}

function ApiDocOverviewContent({ setup, entries }: { setup: string | null; entries: ApiDocEntry[] }) {
  return (
    <div className="flex flex-col gap-6">
      {setup && <Markdown>{setup}</Markdown>}
      {entries.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-text">Other endpoints</h3>
          {entries.map((entry) => <ApiDocEntryCard key={entry.id} entry={entry} />)}
        </div>
      )}
    </div>
  );
}

const ICON_BY_CATEGORY: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  'auth-api': Lock,
  'billing-api': CreditCard,
  'devices-api': Smartphone,
  'feedback-api': MessageSquare,
  'invites-api': UserPlus,
  'me-api': User,
  'notifications-api': Bell,
  'orgs-api': Building2,
  'otp-api': Shield,
  'projects-api': FolderOpen,
  'reports-api': ClipboardList,
  'sprints-api': Zap,
  'tickets-api': Ticket,
};

/** Adapts an Api-Documentation payload (snapshot or live) into sidebar/panel
 *  sections — the same shape regardless of which source it came from. */
function sectionsFromApiDocs(payload: ApiDocsPayload): Section[] {
  const overview: Section = {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    Content: () => <ApiDocOverviewContent setup={payload.overview.setup} entries={payload.overview.entries} />,
  };
  const categories: Section[] = payload.categories.map((category) => ({
    id: category.id,
    label: category.label,
    icon: ICON_BY_CATEGORY[category.id] ?? FileQuestion,
    Content: () => <ApiDocCategoryContent category={category} />,
  }));
  return [overview, ...categories];
}

export default function DocsPage() {
  // Bundled snapshot renders on first paint — no network round trip, no
  // reduced fallback state. See the file header for how to regenerate it.
  const [payload, setPayload] = useState<ApiDocsPayload>(apiDocsSnapshot as ApiDocsPayload);
  const [activeSection, setActiveSection] = useState<string>('overview');

  // If the live backend is reachable, swap in its (potentially fresher) data.
  // If not, the snapshot already covers all categories — nothing degrades.
  useEffect(() => {
    let cancelled = false;
    void fetchApiDocs().then((live) => {
      if (!cancelled && live) setPayload(live);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = useMemo<Section[]>(() => sectionsFromApiDocs(payload), [payload]);

  const active = sections.find((s) => s.id === activeSection) ?? sections[0];
  const ActiveContent = active.Content;

  return (
    <main className="min-h-screen bg-surface text-text">
      <MarketingNav />

      <section className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40">
        <div className="bg-grid absolute inset-0 -z-10 opacity-40" aria-hidden="true" />

        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-primary-subtle bg-primary-subtle/60 px-3 py-1">
            <FileQuestion size={11} className="text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              API reference
            </span>
          </div>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-text sm:text-5xl">
            API Documentation
          </h1>
          <p className="mt-4 max-w-xl text-base text-text-subtle sm:text-lg">
            Browse endpoints by category.
          </p>

          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-[220px_1fr] sm:gap-12">
            {/* Sidebar — pill scroller on mobile, sticky column on desktop */}
            <nav
              aria-label="Docs sections"
              className="flex gap-2 overflow-x-auto pb-2 sm:sticky sm:top-24 sm:h-fit sm:flex-col sm:gap-1 sm:overflow-visible sm:pb-0"
            >
              {sections.map(({ id, label, icon: Icon }) => {
                const isActive = id === activeSection;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSection(id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors sm:whitespace-normal ${
                      isActive
                        ? 'bg-primary-subtle text-primary'
                        : 'text-text-subtle hover:bg-surface-sunken hover:text-text'
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                );
              })}
            </nav>

            {/* Content — swaps with activeSection. `anim-card` is a mount-triggered
                CSS animation (fires immediately on click, no scroll dependency). */}
            <div key={activeSection} className="min-w-0 anim-card">
              <div className="rounded-xl border border-border-subtle bg-surface-raised p-6 sm:p-8">
                <h2 className="text-lg font-semibold text-text">{active.label}</h2>
                <div className="mt-5">
                  <ActiveContent />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
