/**
 * Placeholders + empty-state copy used across the app.
 *
 * Most of the app still has these strings inline — this file is intentionally
 * sparse right now. The pattern: when you add a new placeholder/empty-state,
 * land it here first. When refactoring an existing surface, lift the strings
 * here as you touch the file. Big-bang refactor would be churn for low value.
 */

export const SEARCH = {
  projects: 'Search by name or key…',
} as const;

export const EMPTY_STATES = {
  projects: {
    noneAtAll: {
      title: 'No projects yet',
      pmBody:   'Spin up your first project to start tracking work.',
      userBody: 'Ask your project manager to set up a project to get started.',
      cta:      'Create project',
    },
    noMatches: {
      title: (q: string) => `No projects match "${q}"`,
      body:  'Try a different search or filter.',
    },
    filterExcluded: {
      title: (filterLabel: string) => `No ${filterLabel.toLowerCase()} projects`,
      body:  'Try a different search or filter.',
    },
  },
} as const;
