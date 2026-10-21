import { EPIC_COLOR_HEX } from '@/lib/ticket.meta';
import type { EpicColor } from '@/types/api.types';

// Small colored lozenge for an epic (color dot + name). This is the whole point
// of an epic's color — it tags the epic AND its child tickets so you can spot
// "everything in this epic" at a glance in lists/board. Resolve the {name,color}
// via buildEpicLookup(...).get(ticket.parentKey).
export function EpicTag({ name, color }: { name: string; color: string | null }) {
  const hex = EPIC_COLOR_HEX[(color as EpicColor)] ?? EPIC_COLOR_HEX.slate;
  return (
    <span
      className="inline-flex max-w-[10rem] items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${hex}1a`, color: hex }}
      title={name}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: hex }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
