/**
 * Centralized empty-state and zero-state messages.
 * Change copy here - UI picks it up automatically.
 *
 * Structure: MESSAGES.<feature>.<state> → { title, description, cta? }
 */

export const MESSAGES = {

  dashboard: {
    noProjects: {
      title: 'Start building something great',
      description: 'Projects bring your team, sprints, and tickets together in one place. Create your first one and hit the ground running.',
      cta: 'Create project',
    },
    noProjectsNonAdmin: {
      title: 'No projects yet',
      description: 'Ask an admin or project manager in this organization to create the first project - once one exists you’ll see it here.',
    },
  },

  myWork: {
    noTickets: {
      title: "You're all caught up!",
      description: 'No tickets are assigned to you right now. Enjoy the calm before the next sprint.',
    },
    noResults: {
      title: 'No tickets match',
      description: 'Try a different filter or clear the current one to see all your work.',
    },
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
    noSprints: {
      title: 'Nothing in the backlog yet',
      description: 'Create your first sprint and start filling it with tickets. Great things start here.',
      cta: 'Create sprint',
    },
  },

  archive: {
    noCompletedSprints: {
      title: 'No completed sprints yet',
      description: "When you complete a sprint, it lands here. Keep shipping - you'll fill this up soon.",
    },
  },

  sprint: {
    noTickets: {
      title: 'Sprint is empty',
      description: 'Add tickets from the Backlog to get this sprint moving.',
    },
  },

} as const;

export type Messages = typeof MESSAGES;
