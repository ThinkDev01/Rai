'use client';

import { useState } from 'react';
import { Pencil, Check, X } from '@/lib/icons';
import { EPIC_COLOR_HEX } from '@/lib/ticket.meta';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import {
  TicketTypeFieldsForm, typeFieldsToPayload, type TypeFieldsValue,
} from '@/components/ticket/TicketTypeFieldsForm';
import type { Ticket, TicketTypeFieldsPayload, EpicColor } from '@/types/api.types';

// Read/edit card for the type-specific fields on the ticket detail page.
// Mirrors the Description card's look (uppercase label + hover Pencil + Save/
// Cancel) and reuses TicketTypeFieldsForm for the edit state. Renders nothing
// for plain tasks.

const HEADING: Record<Exclude<Ticket['type'], 'task'>, string> = {
  epic:  'Epic details',
  story: 'Story details',
  bug:   'Bug details',
};

function ticketToFormValue(t: Ticket): TypeFieldsValue {
  return {
    epicName:           t.epicName ?? '',
    epicColor:          (t.epicColor as EpicColor) ?? 'blue',
    storyPoints:        t.storyPoints != null ? String(t.storyPoints) : '',
    acceptanceCriteria: t.acceptanceCriteria ?? '',
    stepsToReproduce:   t.stepsToReproduce ?? '',
    environment:        t.environment ?? '',
  };
}

interface Props {
  ticket:   Ticket;
  canEdit:  boolean;
  isSaving: boolean;
  onSave:   (payload: TicketTypeFieldsPayload) => void;
}

export function TicketDetailsCard({ ticket, canEdit, isSaving, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<TypeFieldsValue>(() => ticketToFormValue(ticket));

  if (ticket.type === 'task') return null;
  const heading = HEADING[ticket.type];

  function openEdit() {
    setDraft(ticketToFormValue(ticket));
    setEditing(true);
  }

  function save() {
    // Whole type payload (typeFieldsToPayload returns null for cleared fields),
    // diffed against the current ticket so we only send what actually changed.
    const next = typeFieldsToPayload(ticket.type, draft);
    const changed: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(next)) {
      const current = (ticket as unknown as Record<string, unknown>)[k] ?? null;
      if (v !== current) changed[k] = v;
    }
    if (Object.keys(changed).length > 0) onSave(changed as TicketTypeFieldsPayload);
    setEditing(false);
  }

  return (
    <section className="group rounded-lg border border-border bg-surface-raised p-4 sm:p-5">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">{heading}</h3>
        {!editing && canEdit && (
          <button
            onClick={openEdit}
            className="rounded p-0.5 text-text-placeholder opacity-0 transition-opacity hover:text-text group-hover:opacity-100 focus:opacity-100"
          >
            <Pencil size={11} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <TicketTypeFieldsForm
            type={ticket.type}
            value={draft}
            onChange={patch => setDraft(prev => ({ ...prev, ...patch }))}
            disabled={isSaving}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              <Check size={11} /> Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1.5 rounded border border-border px-3 py-1 text-xs font-medium text-text-subtle transition-colors hover:bg-surface"
            >
              <X size={11} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <TicketDetailsRead ticket={ticket} canEdit={canEdit} onEmptyClick={openEdit} />
      )}
    </section>
  );
}

// ── Read view ────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-subtle">{label}</span>
      {children}
    </div>
  );
}

function Empty({ canEdit, onClick, text }: { canEdit: boolean; onClick: () => void; text: string }) {
  return canEdit ? (
    <p onClick={onClick} className="cursor-text text-sm italic text-text-placeholder transition-colors hover:text-text-subtle">{text}</p>
  ) : (
    <p className="text-sm italic text-text-placeholder">—</p>
  );
}

function TicketDetailsRead({ ticket, canEdit, onEmptyClick }: { ticket: Ticket; canEdit: boolean; onEmptyClick: () => void }) {
  if (ticket.type === 'epic') {
    return (
      <div className="flex flex-col gap-3">
        <Field label="Epic name">
          {ticket.epicName ? (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: EPIC_COLOR_HEX[(ticket.epicColor as EpicColor) ?? 'blue'] }} />
              <span className="text-sm text-text">{ticket.epicName}</span>
            </div>
          ) : <Empty canEdit={canEdit} onClick={onEmptyClick} text="Add an epic name…" />}
        </Field>
      </div>
    );
  }

  if (ticket.type === 'story') {
    return (
      <div className="flex flex-col gap-3">
        <Field label="Story points">
          {ticket.storyPoints != null
            ? <span className="inline-flex w-fit items-center rounded bg-surface px-2 py-0.5 text-xs font-semibold text-text-subtle">{ticket.storyPoints}</span>
            : <Empty canEdit={canEdit} onClick={onEmptyClick} text="Not estimated" />}
        </Field>
        <Field label="Acceptance criteria">
          {ticket.acceptanceCriteria
            ? <MarkdownRenderer content={ticket.acceptanceCriteria} />
            : <Empty canEdit={canEdit} onClick={onEmptyClick} text="Add acceptance criteria…" />}
        </Field>
      </div>
    );
  }

  // bug
  return (
    <div className="flex flex-col gap-3">
      <Field label="Steps to reproduce">
        {ticket.stepsToReproduce
          ? <MarkdownRenderer content={ticket.stepsToReproduce} />
          : <Empty canEdit={canEdit} onClick={onEmptyClick} text="Add steps to reproduce…" />}
      </Field>
      <Field label="Environment">
        {ticket.environment
          ? <p className="text-sm text-text">{ticket.environment}</p>
          : <Empty canEdit={canEdit} onClick={onEmptyClick} text="Add environment…" />}
      </Field>
    </div>
  );
}
