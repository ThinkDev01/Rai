'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, Search, UserPlus, Loader2, Mail } from '@/lib/icons';
import { useTeamMembers } from '@/hooks/useTeam';
import { useAddProjectMember } from '@/hooks/useProjects';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import type { Member } from '@/types/api.types';

interface Props {
  projectId: string;
  existingMemberIds: string[];
  onClose: () => void;
}

export function AddMemberModal({ projectId, existingMemberIds, onClose }: Props) {
  const [filter, setFilter] = useState('');
  const slug = useCurrentSlug() ?? '';
  const { data: allUsers = [], isLoading } = useTeamMembers();
  const { mutate: addMember, isPending } = useAddProjectMember(projectId);

  // Users not already in the project
  const eligible = allUsers.filter(u =>
    !existingMemberIds.includes(u.id) &&
    (filter === '' ||
      u.name.toLowerCase().includes(filter.toLowerCase()) ||
      u.email.toLowerCase().includes(filter.toLowerCase()))
  );

  function handleAdd(user: Member) {
    addMember(user.id);
    // Stay open so admin can add multiple at once
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text">Add member</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary"
            />
          </div>
        </div>

        {/* User list */}
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={18} className="animate-spin text-text-placeholder" />
            </div>
          ) : eligible.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-text-placeholder">
              {filter ? 'No users match your search.' : 'All org members are already in this project.'}
            </p>
          ) : (
            eligible.map(user => (
              <div
                key={user.id}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                  {user.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">{user.name}</p>
                  <p className="text-xs text-text-placeholder truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-text-placeholder">{user.role_name}</span>
                  <button
                    onClick={() => handleAdd(user)}
                    disabled={isPending}
                    className="flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    <UserPlus size={11} />
                    Add
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer - Done + invite-by-email shortcut. AddMemberModal only lists
            existing org members; if the person isn't on the org yet, the
            admin needs to invite them via the team page first. Link surfaces
            that path inline so the flow doesn't dead-end. */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-3">
          <Link
            href={orgRoute(slug, '/team')}
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-primary transition-colors hover:underline"
          >
            <Mail size={12} />
            Don&apos;t see them? Invite by email →
          </Link>
          <button
            onClick={onClose}
            className="rounded border border-border px-4 py-1.5 text-sm text-text-subtle transition-colors hover:bg-surface"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
