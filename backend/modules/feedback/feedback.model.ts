import { uuidv7 } from 'uuidv7';
import pool from '../../config/db';
import type { FeedbackRow } from './feedback.types';

/** Persist one feedback submission. org_id is the user's current org (nullable). */
export async function insertFeedback(
  userId: string,
  orgId: string | null,
  title: string,
  body: string,
): Promise<FeedbackRow> {
  const id = uuidv7();
  const res = await pool.query<FeedbackRow>(
    `INSERT INTO feedback (id, user_id, org_id, title, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, org_id, title, body, created_at`,
    [id, userId, orgId, title, body],
  );
  return res.rows[0]!;
}
