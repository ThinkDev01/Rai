import { redirect } from 'next/navigation';

// /admin merged into /team - see app/(app)/team/page.tsx for the unified
// member-management surface (Slack / Linear / GitHub pattern: one page,
// admin actions render inline when the caller has the role).
//
// Route kept as a redirect so existing bookmarks, in-app links, and email
// references don't 404. Sidebar no longer surfaces the link.

export default function AdminRedirect() {
  redirect('/team');
}
