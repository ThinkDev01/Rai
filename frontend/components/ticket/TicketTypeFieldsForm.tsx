'use client';

import { RichSelect, type RichSelectOption } from '@/components/ui/RichSelect';
import { EPIC_COLOR_HEX, STORY_POINT_VALUES } from '@/lib/ticket.meta';
import {
  EPIC_COLORS, EPIC_NAME_MAX, ENVIRONMENT_MAX, LONG_TEXT_MAX,
  type TicketType, type EpicColor,
} from '@/types/api.types';

// Editable form state for the type-specific fields. Strings throughout for
// controlled inputs; `storyPoints` is '' when not estimated. The caller maps
// this to the API payload (numbers, null) at submit time.
export interface TypeFieldsValue {
  epicName:            string;
  epicColor:          EpicColor;
  storyPoints:        string;
  acceptanceCriteria: string;
  stepsToReproduce:   string;
  environment:        string;
}

export const EMPTY_TYPE_FIELDS: TypeFieldsValue = {
  epicName: '', epicColor: 'blue', storyPoints: '',
  acceptanceCriteria: '', stepsToReproduce: '', environment: '',
};

const STORY_POINT_OPTIONS: RichSelectOption<string>[] = [
  { value: '', label: 'Not estimated', rowCls: 'text-text-subtle' },
  ...STORY_POINT_VALUES.map(v => ({ value: String(v), label: `${v} ${v === 1 ? 'point' : 'points'}` })),
];

interface Props {
  type:     TicketType;
  value:    TypeFieldsValue;
  onChange: (patch: Partial<TypeFieldsValue>) => void;
  disabled?: boolean;
}

const inputCls = 'rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary disabled:opacity-60';

/**
 * Type-conditional ticket fields (Jira parity). Renders nothing for `task`;
 * Epic → name + color, Story → points + acceptance criteria, Bug → steps +
 * environment. Shared by the create modal and the ticket detail panel so the
 * two never drift. Hard-coded type→fields mapping (no admin screen config in
 * v2) — see backend tickets.controller TYPE_FIELD_COLUMNS.
 */
export function TicketTypeFieldsForm({ type, value, onChange, disabled = false }: Props) {
  if (type === 'epic') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">
            Epic name <span className="font-normal text-text-placeholder text-xs">(short label)</span>
          </label>
          <input
            type="text"
            value={value.epicName}
            maxLength={EPIC_NAME_MAX}
            disabled={disabled}
            onChange={e => onChange({ epicName: e.target.value })}
            placeholder="e.g. Billing revamp"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Epic color</label>
          <div className="flex flex-wrap gap-2">
            {EPIC_COLORS.map(c => (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ epicColor: c })}
                title={c}
                aria-label={c}
                style={{ backgroundColor: EPIC_COLOR_HEX[c] }}
                className={`h-6 w-6 rounded-full transition-transform disabled:opacity-60 ${
                  value.epicColor === c ? 'ring-2 ring-offset-2 ring-offset-surface-raised ring-text scale-110' : 'hover:scale-110'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'story') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Story points</label>
          <RichSelect
            value={value.storyPoints}
            options={STORY_POINT_OPTIONS}
            onChange={v => onChange({ storyPoints: v })}
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">
            Acceptance criteria <span className="font-normal text-text-placeholder text-xs">(optional)</span>
          </label>
          <textarea
            rows={5}
            value={value.acceptanceCriteria}
            maxLength={LONG_TEXT_MAX}
            disabled={disabled}
            onChange={e => onChange({ acceptanceCriteria: e.target.value })}
            placeholder={'- Given …\n- When …\n- Then …'}
            className={`resize-none ${inputCls}`}
          />
        </div>
      </div>
    );
  }

  if (type === 'bug') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">
            Steps to reproduce <span className="font-normal text-text-placeholder text-xs">(optional)</span>
          </label>
          <textarea
            rows={5}
            value={value.stepsToReproduce}
            maxLength={LONG_TEXT_MAX}
            disabled={disabled}
            onChange={e => onChange({ stepsToReproduce: e.target.value })}
            placeholder={'1. …\n2. …\n3. …'}
            className={`resize-none ${inputCls}`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">
            Environment <span className="font-normal text-text-placeholder text-xs">(optional)</span>
          </label>
          <input
            type="text"
            value={value.environment}
            maxLength={ENVIRONMENT_MAX}
            disabled={disabled}
            onChange={e => onChange({ environment: e.target.value })}
            placeholder="e.g. Chrome 120 · Windows 11 · build 1.4.2"
            className={inputCls}
          />
        </div>
      </div>
    );
  }

  return null; // task — no extra fields
}

// ── Payload helpers ──────────────────────────────────────────────────────────

/** Map the form state to the API field payload for the given type. Only the
 *  fields the type owns are included; trimmed-empty → undefined (create) or
 *  the caller can post-process to null for clears. */
export function typeFieldsToPayload(type: TicketType, v: TypeFieldsValue): Record<string, string | number | null> {
  if (type === 'epic') {
    return { epicName: v.epicName.trim() || null, epicColor: v.epicColor };
  }
  if (type === 'story') {
    return {
      storyPoints: v.storyPoints ? Number(v.storyPoints) : null,
      acceptanceCriteria: v.acceptanceCriteria.trim() || null,
    };
  }
  if (type === 'bug') {
    return {
      stepsToReproduce: v.stepsToReproduce.trim() || null,
      environment: v.environment.trim() || null,
    };
  }
  return {};
}
