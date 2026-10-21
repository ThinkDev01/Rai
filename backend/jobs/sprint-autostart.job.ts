// Sprint auto-start job (v1 fix item 19).
//
// A planned sprint with a start_date doesn't begin on its own — someone has to
// open it and flip it to active. This job does that automatically: any planned
// sprint whose start date has arrived (IST) is moved to 'active', one per
// project (the earliest), and every project member is notified on all three
// channels (in-app + email + push) via the sprint_started notification.
//
// Idempotent + safe to run repeatedly — the DB query only touches rows that are
// still planned and due, so a second run the same day is a no-op. Triggered
// hourly by EventBridge; also runnable standalone: npm run jobs:sprint-autostart

import pool from '../config/db';
import logger from '../config/logger';
import { activateDueSprints } from '../modules/sprints/sprints.model';
import { getProjectMembers } from '../modules/projects/projects.model';
import { notifyMany } from '../modules/notifications/notifications.service';

const ROUTE = 'jobs.sprint-autostart';

/**
 * Activate all due planned sprints and notify their project members. Returns the
 * number of sprints started. Never throws past its own boundary — a notification
 * failure for one sprint can't stop the rest (notifyMany already isolates per
 * recipient; we also wrap per sprint).
 */
export async function runSprintAutostart(): Promise<number> {
  logger.info({ userId: 'system', route: ROUTE }, 'Sprint auto-start - sweep begin');

  const activated = await activateDueSprints();
  if (activated.length === 0) {
    logger.info({ userId: 'system', route: ROUTE, activated: 0 }, 'Sprint auto-start - nothing due');
    return 0;
  }

  for (const sprint of activated) {
    try {
      const members = await getProjectMembers(sprint.org_id, sprint.project_id);
      const recipients = members.map((m) => m.id);
      logger.info(
        { userId: 'system', route: ROUTE, sprintId: sprint.id, projectId: sprint.project_id, orgId: sprint.org_id, recipients: recipients.length },
        'Sprint auto-started - notifying project members',
      );
      // System-triggered: no actor to exclude, every member hears about it.
      void notifyMany(recipients, {
        type:  'sprint_started',
        orgId: sprint.org_id,
        link:  `/projects/${sprint.project_id}/sprints/${sprint.id}`,
        data:  { sprintName: sprint.name, projectName: sprint.project_name },
      });
    } catch (err) {
      logger.error(
        { userId: 'system', route: ROUTE, sprintId: sprint.id, error: (err as Error).message },
        'Sprint auto-start - failed to notify members (sprint is still active)',
      );
    }
  }

  logger.info({ userId: 'system', route: ROUTE, activated: activated.length }, 'Sprint auto-start - sweep done');
  return activated.length;
}

// Standalone run for manual testing: `npm run jobs:sprint-autostart`.
if (require.main === module) {
  runSprintAutostart()
    .then(async (n) => {
      await pool.end();
      logger.info({ userId: 'system', route: ROUTE, activated: n }, 'Sprint auto-start script finished');
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error(
        { userId: 'system', route: ROUTE, error: (err as Error).message, stack: (err as Error).stack },
        'Sprint auto-start script failed',
      );
      await pool.end().catch(() => { /* already failing - best effort */ });
      process.exit(1);
    });
}
