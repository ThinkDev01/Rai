// ── DB row types ──────────────────────────────────────────────────────────────

export interface SprintRow {
  id: number;
  org_id: string;
  project_id: number;
  name: string;
  goal: string | null;
  notes: string | null;
  status: 'planned' | 'active' | 'completed';
  start_date: Date | null;
  end_date: Date | null;
  /** When the sprint was last archived. NULL = not archived. Separate from
   *  status so a `completed` sprint can be archived without losing its
   *  historical status. Display date deferred to v3. */
  archived_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// ── Request body shapes ───────────────────────────────────────────────────────

export interface CreateSprintBody {
  name: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
  notes?: string;
}

export interface UpdateSprintBody {
  name?: string;
  goal?: string | null;
  notes?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: 'planned' | 'active' | 'completed';
  /** Toggle archive state. Setting `true` stamps `archived_at = NOW()`;
   *  `false` clears it. Backend enforces per rbac.md §Sprint actions. */
  archived?: boolean;
}

// ── Response shape (matches v1 frontend contract) ─────────────────────────────
//
// `tickets` is populated when the sprint is returned as part of a full
// Project response (so the Board/Backlog pages can render without extra
// round-trips). When sprints are returned standalone (POST/PATCH/DELETE),
// `tickets` is omitted via `toSprintResponse`; callers nest the array
// themselves when assembling the project payload.

export interface SprintResponse {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  goal: string | null;
  notes: string | null;
  projectId: string;
  /** ISO string when archived, null when not. Frontend uses this to filter
   *  archived sprints out of the regular list and into the Archive page. */
  archivedAt: string | null;
  tickets?: unknown[];
  createdAt: string;
  updatedAt: string;
}

export function toSprintResponse(row: SprintRow): SprintResponse {
  return {
    id: String(row.id),
    name: row.name,
    status: row.status,
    startDate: row.start_date?.toISOString() ?? '',
    endDate: row.end_date?.toISOString() ?? '',
    goal: row.goal,
    notes: row.notes,
    projectId: String(row.project_id),
    archivedAt: row.archived_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
