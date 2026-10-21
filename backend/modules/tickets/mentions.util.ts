// @mention resolution for ticket comments.
//
// Notifications route on the ids the author EXPLICITLY selected from the
// @-dropdown — sent as `mentions: string[]` on the request and validated by
// `validateMentionIds`. That binding is id-based, so two members sharing a
// display name (allowed in Rai) route correctly, and a typed-but-unselected
// `@name` carries no id and never notifies.
//
// `parseMentions` (name-based) is NOT used for routing. It survives only to
// answer "was this member already named in the PRE-edit body?" so an edit
// doesn't re-ping a mention that was already there. Names can repeat and
// contain spaces, so it matches against the KNOWN member list rather than
// parsing free-text tokens.

interface MentionableMember {
  id: string;
  name: string | null;
}

/**
 * Filters a client-supplied list of mention user ids down to the ones we'll
 * actually notify: must be a project member (so a crafted payload can't notify
 * someone off the project) and not the author themselves. De-duped.
 */
export function validateMentionIds(
  requested: unknown,
  memberIds: Set<string>,
  excludeUserId: string,
): string[] {
  if (!Array.isArray(requested)) return [];
  const out = new Set<string>();
  for (const id of requested) {
    if (typeof id === 'string' && id !== excludeUserId && memberIds.has(id)) out.add(id);
  }
  return [...out];
}

// A char that can legitimately continue a display name. If the char right after
// a matched "@<name>" is one of these, the name was only a prefix of a longer
// word (e.g. "@Al" inside "@Alice") — not a real match.
const NAME_CHAR = /[a-z0-9]/i;

/**
 * Returns the de-duped user ids of project members mentioned in `content`.
 * Case-insensitive. Only members in `members` can be matched (you can only
 * mention someone on the project), so this can't leak users outside the project.
 */
export function parseMentions(content: string, members: MentionableMember[]): string[] {
  if (!content || !content.includes('@')) return [];

  const haystack = content.toLowerCase();
  const hits = new Set<string>();

  for (const m of members) {
    const name = m.name?.trim();
    if (!name) continue;

    const needle = `@${name.toLowerCase()}`;
    let from = 0;
    while (from <= haystack.length) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;

      // Boundary check: the char after the name must NOT be a name char, else
      // we've matched a shorter name sitting inside a longer one.
      const after = haystack[idx + needle.length];
      if (after === undefined || !NAME_CHAR.test(after)) {
        hits.add(m.id);
        break;
      }
      from = idx + needle.length;
    }
  }

  return [...hits];
}
