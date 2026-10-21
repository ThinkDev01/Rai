import { EPIC_COLOR_HEX } from '@/lib/ticket.meta';
import type { Ticket, EpicColor } from '@/types/api.types';

// Epic progress bar — "N of M done" + % + a bar tinted with the epic color.
// Computed from the epic's child tickets (status === 'done' / total). Shown on
// the epic's detail page + panel so an epic reads as a container with progress,
// not an empty single field.
export function EpicProgress({ childTickets, color }: { childTickets: Ticket[]; color: string | null }) {
  const total = childTickets.length;
  const done  = childTickets.filter(t => t.status === 'done').length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  const hex   = EPIC_COLOR_HEX[(color as EpicColor)] ?? EPIC_COLOR_HEX.slate;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-text-subtle">
        <span>{total === 0 ? 'No child tickets yet' : `${done} of ${total} done`}</span>
        {total > 0 && <span className="font-medium" style={{ color: hex }}>{pct}%</span>}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-surface">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: hex }} />
      </div>
    </div>
  );
}
