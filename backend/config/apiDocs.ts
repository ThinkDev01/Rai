import fs from 'fs';
import path from 'path';

/**
 * Reads rai-backend/Api-Documentation and exposes it as structured JSON for
 * the frontend /docs page — the single source of truth for API docs.
 * Isolated: removable by deleting this file + its one route in app.ts.
 *
 * Api-Documentation/*.md is hand-written and uses two coexisting patterns:
 *   - single-operation file: H1 title, a `METHOD /path` line, then
 *     "## Request" / "## Responses" sections (most files).
 *   - multi-operation file: H1 title, intro prose, then several repeated
 *     "## METHOD /path" sub-sections (billing-api/billing, me-api/pin-project,
 *     me-api/pin-ticket — one file documents multiple related endpoints).
 * Rather than force brittle per-field extraction across both patterns, each
 * docs.md + curl.md PAIR is exposed as one card: the full docs.md body
 * (rendered as markdown by the frontend) + the full curl.md body, plus a
 * light regex scan for `METHOD /path` occurrences so list/sidebar views can
 * show method badges without re-parsing prose.
 */

const DOCS_ROOT = path.join(__dirname, '../Api-Documentation');

// Folder name -> sidebar label. Order here is the sidebar order (Overview is
// prepended separately by the frontend, which also owns its icon mapping).
const CATEGORY_LABELS: Record<string, string> = {
  'auth-api': 'Authentication',
  'billing-api': 'Billing',
  'devices-api': 'Devices',
  'feedback-api': 'Feedback',
  'invites-api': 'Invites',
  'me-api': 'Me',
  'notifications-api': 'Notifications',
  'orgs-api': 'Organizations',
  'otp-api': 'OTP',
  'projects-api': 'Projects',
  'reports-api': 'Reports',
  'sprints-api': 'Sprints',
  'tickets-api': 'Tickets',
};

const METHOD_PATH_RE = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s`)]+)/g;

export interface ApiDocMethodPath {
  method: string;
  path: string;
}

export interface ApiDocEntry {
  id: string;
  title: string;
  methods: ApiDocMethodPath[];
  docs: string;
  curl: string | null;
}

export interface ApiDocCategory {
  id: string;
  label: string;
  entries: ApiDocEntry[];
}

export interface ApiDocsPayload {
  categories: ApiDocCategory[];
  overview: {
    setup: string | null;
    entries: ApiDocEntry[];
  };
}

function normalize(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n');
}

function stripH1(markdown: string): string {
  return normalize(markdown).replace(/^#\s+.+\n/, '').trim();
}

function extractMethods(markdown: string): ApiDocMethodPath[] {
  const seen = new Set<string>();
  const out: ApiDocMethodPath[] = [];
  for (const match of markdown.matchAll(METHOD_PATH_RE)) {
    const method = match[1] as string;
    const rawPath = (match[2] as string).replace(/[.,;:]+$/, '');
    const key = `${method} ${rawPath}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ method, path: rawPath });
    }
  }
  return out;
}

function readEntry(dir: string, baseName: string): ApiDocEntry | null {
  const docsPath = path.join(dir, `${baseName} - docs.md`);
  if (!fs.existsSync(docsPath)) return null;
  const rawDocs = fs.readFileSync(docsPath, 'utf-8');
  const titleMatch = rawDocs.match(/^#\s+(.+)$/m);

  const curlPath = path.join(dir, `${baseName} - curl.md`);
  const rawCurl = fs.existsSync(curlPath) ? fs.readFileSync(curlPath, 'utf-8') : null;

  return {
    id: baseName,
    title: titleMatch?.[1]?.trim() ?? baseName,
    methods: extractMethods(rawDocs),
    docs: stripH1(rawDocs),
    curl: rawCurl ? stripH1(rawCurl) : null,
  };
}

function readCategoryDir(dirName: string): ApiDocEntry[] {
  const dir = path.join(DOCS_ROOT, dirName);
  if (!fs.existsSync(dir)) return [];

  const baseNames = new Set<string>();
  for (const file of fs.readdirSync(dir)) {
    const m = file.match(/^(.+) - (?:docs|curl)\.md$/);
    if (m?.[1]) baseNames.add(m[1]);
  }

  return Array.from(baseNames)
    .sort()
    .map((name) => readEntry(dir, name))
    .filter((e): e is ApiDocEntry => e !== null);
}

function buildApiDocs(): ApiDocsPayload {
  const categories: ApiDocCategory[] = Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
    id,
    label,
    entries: readCategoryDir(id),
  }));

  const setupPath = path.join(DOCS_ROOT, '_setup.md');
  const setup = fs.existsSync(setupPath) ? stripH1(fs.readFileSync(setupPath, 'utf-8')) : null;

  // Loose top-level endpoints (no folder of their own) fold into Overview.
  const overviewEntries = ['health', 'search', 'users']
    .map((name) => readEntry(DOCS_ROOT, name))
    .filter((e): e is ApiDocEntry => e !== null);

  return { categories, overview: { setup, entries: overviewEntries } };
}

// Computed once at boot — these are static files that only change on
// deploy, not per-request.
export const apiDocsPayload = buildApiDocs();
