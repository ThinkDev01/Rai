// Centralized empty/zero-state copy — ported from web lib/messages.ts
export const MESSAGES = {
  dashboard: {
    noProjects: {
      title: 'No projects yet',
      description: 'Create your first project to start tracking work.',
      cta: 'Create project',
    },
    noProjectsNonAdmin: {
      title: 'No projects yet',
      description: 'Ask an admin or project manager to create a project.',
    },
  },
  myWork: {
    noTickets: { title: "You're all caught up", description: 'No tickets are assigned to you.' },
    noResults: { title: 'No tickets found', description: 'No tickets match the current filters.' },
  },
  board: {
    noSprints: {
      title: 'No sprints yet',
      description: 'Create your first sprint from the sidebar, add tickets to it, then start it.',
      cta: 'Go to Backlog',
    },
    noActiveSprint: {
      title: 'No active sprint',
      description: 'Head to the Backlog, pick a planned sprint, and hit Start to begin.',
      cta: 'Go to Backlog',
    },
    noActiveSprint_archived: {
      title: 'Project archived',
      description: 'This project is read-only. No active sprint to display.',
    },
  },
  backlog: {
    noSprints: { title: 'No sprints yet', description: 'Create your first sprint.' },
  },
  archive: {
    noCompletedSprints: { title: 'No archived sprints', description: 'Completed sprints will appear here.' },
  },
  sprint: {
    noTickets: { title: 'No tickets', description: 'Add tickets from the backlog.' },
  },
  team: {
    noMembers: { title: 'No members', description: 'Invite people to your organization.' },
  },
  projects: {
    empty: { title: 'No projects yet', description: 'Create your first project.', cta: 'Create project' },
    noResults: { title: 'No matches', description: 'No projects match your search/filters.' },
  },
  sprints: {
    empty: { title: 'No sprints yet', description: 'Create your first sprint.', cta: 'Create sprint' },
  },
  search: {
    empty: { title: 'No tickets found', description: 'Try a different search term.' },
    hint: { title: 'Search tickets', description: 'Type at least 2 characters to search across all tickets.' },
  },
} as const;
