import { redirect } from 'next/navigation';

// Bare /orgs/<slug>/projects/<id> URL → redirect to /overview within the
// same org-scoped path. The previous redirect dropped the /orgs/<slug>
// prefix entirely (a leftover from the pre-multi-tenant route shape) and
// landed on a 404. Param destructuring covers both slug + id.
export default async function ProjectRoot({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  redirect(`/orgs/${slug}/projects/${id}/overview`);
}
