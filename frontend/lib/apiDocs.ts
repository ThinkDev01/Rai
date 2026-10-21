// Fetch helper for the manual API docs endpoint.
//
// Source of truth is rai-backend/Api-Documentation/, read and served as JSON
// by GET /api/docs (see rai-backend/config/apiDocs.ts). The /docs page fetches
// it on mount; if the fetch fails for any reason, the page falls back to its
// built-in static content so it never breaks.
//
// Removal: delete this file + its one call site in app/docs/page.tsx. The
// backend route/reader can be removed independently (see config/apiDocs.ts).

import { ENV } from './env';

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

// /api/docs is served at the backend's root (see rai-backend/app.ts), not
// under /api/v1 like the rest of the API — so we need the origin only.
function backendOrigin(): string {
  try {
    return new URL(ENV.API_URL).origin;
  } catch {
    return 'http://localhost:4000';
  }
}

/** Never throws — returns null on any failure so the caller falls back to
 *  the page's built-in static content. */
export async function fetchApiDocs(): Promise<ApiDocsPayload | null> {
  try {
    const res = await fetch(`${backendOrigin()}/api/docs`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ApiDocsPayload;
  } catch {
    return null;
  }
}
