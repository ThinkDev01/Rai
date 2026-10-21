'use client';

import { useState } from 'react';
import { X } from '@/lib/icons';
import { useCreateSprint } from '@/hooks/useSprints';
import { DatePicker } from '@/components/ui/DatePicker';
import { capitalizeFirst } from '@/lib/text.utils';

interface Props {
  projectId: string;
  projectKey: string;
  /** Optional list of existing sprint names in this project. Used to
   *  pre-fill a non-colliding default name like "RAI Sprint 4" when the
   *  caller can supply it. If omitted, falls back to "<key> Sprint 1". */
  existingSprintNames?: string[];
  onClose: () => void;
}

/**
 * Compute a sensible default sprint name based on what already exists.
 *
 * Rule:
 *   1. Look at every existing sprint name.
 *   2. Extract the trailing integer (e.g. "RAI Sprint 7" → 7, "Hotfix" → 0).
 *   3. Default = "<key> Sprint <max + 1>".
 *   4. If no name ends in a digit, fall back to "<key> Sprint <count + 1>"
 *      so we still increment instead of repeating the same default.
 *
 * Why scan trailing digits rather than only matching "<key> Sprint N":
 *   teams rename sprints to whatever they want ("Hardening 3", "Q2 Push 4",
 *   "Bugbash 12"); the trailing-number heuristic still bumps past those
 *   instead of starting back at 1. The fallback covers the case where every
 *   sprint has a free-form name — incrementing by count keeps the default
 *   moving forward even then.
 */
function computeDefaultSprintName(projectKey: string, existing: string[] | undefined): string {
  const names = existing ?? [];
  const numbers = names
    .map(n => {
      const m = n.trim().match(/(\d+)\s*$/);
      return m ? parseInt(m[1]!, 10) : 0;
    })
    .filter(n => n > 0);
  const next = numbers.length > 0
    ? Math.max(...numbers) + 1
    : names.length + 1;
  return `${projectKey} Sprint ${next}`;
}

export function CreateSprintModal({ projectId, projectKey, existingSprintNames, onClose }: Props) {
  // Default name computed once at mount. If the user opens the modal, types
  // something, then closes + reopens, the next open recomputes — caller
  // unmounts/remounts the modal between sessions, which is the normal flow.
  const [name, setName]           = useState(() => computeDefaultSprintName(projectKey, existingSprintNames));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [nameError, setNameError] = useState('');
  const { mutate: createSprint, isPending } = useCreateSprint(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setNameError('Sprint name is required'); return; }
    createSprint(
      { name: name.trim(), startDate, endDate },
      { onSuccess: () => onClose() }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised shadow-xl">

        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text">Create sprint</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 flex flex-col gap-4">

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              Sprint name <span className="text-danger">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              // Auto-capitalize first letter at create time. Default sprint
              // name already starts capitalized ("<PROJKEY> Sprint N"), but
              // if the user clears it and types from scratch we want the
              // first character to still uppercase.
              onChange={e => { setName(capitalizeFirst(e.target.value)); if (nameError) setNameError(''); }}
              className={`rounded border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary ${nameError ? 'border-danger' : 'border-border'}`}
            />
            {nameError && <p className="text-xs text-danger">{nameError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              label="Start date"
              value={startDate}
              onChange={setStartDate}
              placeholder="Pick start"
              max={endDate || undefined}
            />
            <DatePicker
              label="End date"
              value={endDate}
              onChange={setEndDate}
              placeholder="Pick end"
              min={startDate || undefined}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded border border-border px-4 py-2 text-sm text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {isPending ? 'Creating…' : 'Create sprint'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
