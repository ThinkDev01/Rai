/**
 * Parse a backend notification link (e.g. "/projects/123/tickets/RAI-45")
 * and navigate to the corresponding in-app screen.
 *
 * `nav` should be any object with a `.navigate(screen, params?)` method —
 * either from `useNavigation()` or a NavigationContainerRef.
 */
export function navigateFromLink(link: string | null | undefined, nav: { navigate: (screen: string, params?: any) => void }): void {
  if (!link) return;

  // /projects/:projectId/tickets/:ticketKey
  const ticketMatch = link.match(/^\/projects\/([^/]+)\/tickets\/([^/]+)/);
  if (ticketMatch) {
    nav.navigate('TicketDetail', { projectId: ticketMatch[1], ticketKey: ticketMatch[2] });
    return;
  }

  // /projects/:projectId/sprints/:sprintId
  const sprintMatch = link.match(/^\/projects\/([^/]+)\/sprints\/([^/]+)/);
  if (sprintMatch) {
    nav.navigate('SprintDetail', { projectId: sprintMatch[1], sprintId: sprintMatch[2] });
    return;
  }

  // /projects/:projectId/...  (overview or any other project sub-route)
  const projectMatch = link.match(/^\/projects\/([^/]+)/);
  if (projectMatch) {
    nav.navigate('Project', { projectId: projectMatch[1] });
    return;
  }

  if (link.startsWith('/team')) {
    nav.navigate('Team');
    return;
  }

  if (link.startsWith('/settings')) {
    nav.navigate('Settings');
    return;
  }
}
