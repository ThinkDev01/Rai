import { insertNotification } from '../notifications.model';

// In-app channel: writes the per-user history row that powers the bell/inbox.
// This row is written for EVERY notification (it is the durable record), so the
// channel is platform-agnostic — web bell and a future mobile inbox both read it.

export async function deliverInApp(p: {
  userId: string;
  orgId:  string | null;
  type:   string;
  text:   string;
  link:   string | null;
}): Promise<{ id: number; created_at: string }> {
  return insertNotification({
    userId: p.userId,
    orgId:  p.orgId,
    type:   p.type,
    title:  p.text,
    link:   p.link,
  });
}
