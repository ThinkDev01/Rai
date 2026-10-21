/**
 * users.service - public API for cross-module consumers.
 *
 * `/me/tickets` (me module) shares the MyWorkItem-nested shape with
 * `/users/:id/tickets` here.
 */
export { getTicketsAssignedTo, findOrgMember } from './users.model';
export { shapeMyWorkItem } from './users.controller';
export type { UserTicketRow } from './users.model';
