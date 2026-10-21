import type { Response } from 'express';
import ExcelJS from 'exceljs';
import logger from '../../config/logger';
import { getMemberRole } from '../orgs/orgs.model';
import { gatherOrgExport, type ExportBundle } from './export.model';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { param } from '../../types/common.types';

const ROUTE = '/api/v1/orgs/:id/export';

// Column order per sheet. Keys must match the SQL aliases in export.model. This
// fixes a readable column order in the Excel file (Object.keys order isn't
// guaranteed to be export-friendly) and gives each sheet a header row.
const SHEETS: { name: string; key: keyof ExportBundle; columns: string[] }[] = [
  { name: 'Members',  key: 'members',  columns: ['user_id', 'name', 'email', 'role', 'role_label', 'joined_at'] },
  { name: 'Projects', key: 'projects', columns: ['id', 'key', 'name', 'description', 'visibility', 'archived', 'created_at'] },
  { name: 'Sprints',  key: 'sprints',  columns: ['id', 'project_id', 'project_key', 'name', 'status', 'start_date', 'end_date', 'goal', 'created_at'] },
  { name: 'Tickets',  key: 'tickets',  columns: ['id', 'key', 'project_key', 'sprint_id', 'parent_key', 'title', 'type', 'status', 'priority', 'story_points', 'epic_name', 'epic_color', 'acceptance_criteria', 'steps_to_reproduce', 'environment', 'assignee_email', 'reporter_email', 'description', 'created_at', 'updated_at'] },
  { name: 'Comments', key: 'comments', columns: ['id', 'ticket_id', 'ticket_key', 'author_email', 'content', 'parent_comment_id', 'created_at', 'edited_at'] },
];

function slugifyForFile(s: string): string {
  return s.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase() || 'org';
}

/**
 * GET /api/v1/orgs/:id/export?format=json|xlsx
 *
 * Full org data export (Members / Projects / Sprints / Tickets / Comments).
 * Owner + admin only - it's a complete dump including member emails + every
 * ticket and comment, so it's gated to the org-management tier. Streams a file
 * download (Content-Disposition: attachment).
 */
export async function exportOrgData(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;
  const orgId    = param(req, 'id');
  const format   = (req.query['format'] === 'xlsx' ? 'xlsx' : 'json') as 'json' | 'xlsx';

  logger.info({ route: ROUTE, method: 'GET', userId: callerId, orgId, format }, 'Export org data - start');

  try {
    const role = await getMemberRole(orgId, callerId);
    if (role !== 'owner' && role !== 'admin') {
      logger.warn({ route: ROUTE, userId: callerId, orgId, role }, 'Reject - only owner/admin can export org data');
      res.status(403).json({ success: false, data: {}, error: 'Only owners and admins can export organization data' } satisfies ApiResponse);
      return;
    }

    const bundle = await gatherOrgExport(orgId);
    if (!bundle.org) {
      res.status(404).json({ success: false, data: {}, error: 'Organization not found' } satisfies ApiResponse);
      return;
    }

    const slug      = slugifyForFile(String((bundle.org as { slug?: string }).slug ?? 'org'));
    const stamp     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const baseName  = `rai-export-${slug}-${stamp}`;

    logger.info(
      {
        route: ROUTE, userId: callerId, orgId, format,
        counts: {
          members: bundle.members.length, projects: bundle.projects.length,
          sprints: bundle.sprints.length, tickets: bundle.tickets.length, comments: bundle.comments.length,
        },
      },
      'Export org data - gathered, streaming file',
    );

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`);
      res.status(200).send(JSON.stringify({ exportedAt: new Date().toISOString(), ...bundle }, null, 2));
      logger.info({ route: ROUTE, userId: callerId, orgId, format }, 'Export org data - JSON sent');
      return;
    }

    // xlsx - one worksheet per entity.
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Rai';
    workbook.created = new Date();

    for (const sheet of SHEETS) {
      const ws = workbook.addWorksheet(sheet.name);
      ws.columns = sheet.columns.map(c => ({ header: c, key: c, width: 22 }));
      ws.getRow(1).font = { bold: true };
      for (const row of bundle[sheet.key] as Record<string, unknown>[]) {
        // Dates → ISO strings so Excel shows a stable value; everything else as-is.
        const shaped: Record<string, unknown> = {};
        for (const col of sheet.columns) {
          const v = row[col];
          shaped[col] = v instanceof Date ? v.toISOString() : v;
        }
        ws.addRow(shaped);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
    logger.info({ route: ROUTE, userId: callerId, orgId, format }, 'Export org data - xlsx streamed');
  } catch (err) {
    logger.error(
      { route: ROUTE, userId: callerId, orgId, format, error: (err as Error).message, stack: (err as Error).stack },
      'Export org data - error',
    );
    // If we haven't started streaming the file yet, return a JSON error.
    if (!res.headersSent) {
      res.status(500).json({ success: false, data: {}, error: 'Could not export organization data' } satisfies ApiResponse);
    } else {
      res.end();
    }
  }
}
