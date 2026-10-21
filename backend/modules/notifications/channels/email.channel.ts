import { sendEmail } from '../../email/email.service';
import logger from '../../../config/logger';

// Email channel: thin wrapper over the shared SES sender. Best-effort by design —
// the in-app row is already the durable record, so an SES failure must NEVER
// bubble up and break the user action that triggered the notification. We log
// and move on.

export async function deliverEmail(p: {
  to:      string;
  subject: string;
  text:    string;
  html?:   string;
  userId:  string;
  type:    string;
}): Promise<void> {
  try {
    await sendEmail({
      to: p.to,
      subject: p.subject,
      textBody: p.text,
      ...(p.html ? { htmlBody: p.html } : {}),
    });
    logger.info({ route: 'notifications.email', userId: p.userId, type: p.type, to: p.to }, 'Notification email sent');
  } catch (err) {
    logger.error(
      { route: 'notifications.email', userId: p.userId, type: p.type, to: p.to, error: (err as Error).message },
      'Notification email failed - in-app notification still delivered',
    );
  }
}
