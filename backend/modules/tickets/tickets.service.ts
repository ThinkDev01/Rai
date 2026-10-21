/**
 * tickets.service - public API for cross-module consumers.
 *
 * Today the only consumer is `projects.controller` (assembles the nested
 * Project response with `sprints[].tickets[]` + `backlog[]`). Future readers
 * should also go through here per standards.md §2.
 */
export { getAllTicketsForProject } from './tickets.model';
export { toTicketResponse } from './tickets.types';
export type { TicketRowFull, CommentRowWithAuthor, TicketResponse } from './tickets.types';
