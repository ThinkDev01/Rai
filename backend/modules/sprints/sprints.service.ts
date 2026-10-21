/**
 * sprints.service - public API for cross-module consumers (today: projects).
 */
export { getSprintsForProject } from './sprints.model';
export { toSprintResponse } from './sprints.types';
export type { SprintRow, SprintResponse } from './sprints.types';
