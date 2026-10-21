/**
 * projects.service - public API for cross-module consumers (sprints, tickets,
 * comments, search, reports). Per standards.md §2 modular monolith rule, other
 * modules MUST import only from here - never directly from projects.model.ts.
 *
 * This file is a thin re-export of read-only operations. Every cross-module
 * call passes `orgId` explicitly - same contract as the model layer.
 */
export {
  getProjectByIdInternal,
  getProjectById,
  isProjectMember,
} from './projects.model';

export type { ProjectRow } from './projects.types';
