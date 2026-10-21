'use client';

import { use, useState, useEffect } from 'react';
import { usePageView } from '@/lib/usePageView';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, Users, Trash2, Archive, ArchiveRestore, X, Pencil, Lock, Globe, AlertTriangle } from '@/lib/icons';
import { useProject } from '@/hooks/useProjects';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { useUpdateProject, useArchiveProject, useUnarchiveProject, useDeleteProject, useRemoveProjectMember } from '@/hooks/useProjects';
import { AddMemberModal } from '@/components/modals/AddMemberModal';
import { useAuthStore, useCurrentRole } from '@/store/auth.store';
import { PageError } from '@/components/ui/PageError';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { isNotFoundError } from '@/lib/errors';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { ProjectAvatar } from '@/components/ui/ProjectAvatar';
import { OtpConfirm } from '@/components/ui/OtpConfirm';
import { PROJECT_ICONS, PROJECT_ICON_MAP } from '@/lib/projectAvatar';

// ── Confirm delete modal ──────────────────────────────────────────────────────

function DeleteProjectModal({
  projectId, projectName, onConfirm, onClose, isPending,
}: {
  projectId: string;
  projectName: string;
  onConfirm: (otpCode: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [code, setCode] = useState('');

  return (
    // Not light-dismissible: this is an OTP-gated destructive action. The user
    // alt-tabs to their email to copy the code, and the click that refocuses
    // the window used to land on the backdrop and close the modal mid-flow.
    // Destructive confirms close only via explicit Cancel / X.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="w-full max-w-md rounded-lg border border-danger/40 bg-surface-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-danger">Delete project</h2>
          <button onClick={onClose} className="rounded p-1 text-text-placeholder hover:text-text">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-sm text-text-subtle leading-relaxed">
            This will permanently delete <span className="font-semibold text-text">{projectName}</span> and all its sprints, tickets, and comments. This cannot be undone.
          </p>
          <OtpConfirm
            action="delete_project"
            targetId={projectId}
            code={code}
            onCodeChange={setCode}
            disabled={isPending}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isPending}
              className="rounded border border-border px-4 py-2 text-sm text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(code)}
              disabled={code.length !== 6 || isPending}
              className="rounded bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : 'Delete project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  usePageView('ProjectSettingsPage', 'Project settings page opened', { projectId: id });
  const router = useRouter();
  const slug   = useCurrentSlug() ?? '';
  const { data: project, isLoading, error, refetch } = useProject(id);
  const { mutate: updateProject,    isPending: isSaving      } = useUpdateProject(id);
  const { mutate: archiveProject,   isPending: isArchiving   } = useArchiveProject(id);
  const { mutate: unarchiveProject, isPending: isUnarchiving } = useUnarchiveProject(id);
  const { mutate: deleteProject,    isPending: isDeleting    } = useDeleteProject(id);
  const { mutate: removeMember,     isPending: isRemoving    } = useRemoveProjectMember(id);
  const user    = useAuthStore(s => s.user);
  const role    = useCurrentRole();
  // Project settings: per rbac.md
  //   - Delete a project       → owner / admin only (note ³)
  //   - Edit + Archive + Unarchive → owner / admin / PM-in / PM-on-public
  // We keep two booleans so each control gets the right gate.
  const isAdmin       = role === 'owner' || role === 'admin';
  const [showUnarchive, setShowUnarchive] = useState(false);

  // View/edit mode for the General section. Read-only by default - per the
  // settings UX rule, never render raw editable forms without explicit
  // intent. `editingGeneral` flips the entire section into edit mode at
  // once (single Save/Cancel covers all three fields: name, description,
  // visibility) instead of per-field micro-edits that crowded the layout.
  const [editingGeneral,  setEditingGeneral] = useState(false);
  const [name,            setName]          = useState('');
  const [description,     setDescription]   = useState('');
  const [visibility,      setVisibility]    = useState<'public' | 'private'>('private');
  // Preset avatar (v2 = icon gallery only). `avatarType='initials'` + null id
  // is the default key-letter tile; `'icon'` + a gallery id renders that icon.
  const [avatarType,      setAvatarType]    = useState<'initials' | 'icon'>('initials');
  const [avatarValue,     setAvatarValue]   = useState<string | null>(null);
  const [showDeleteModal, setShowDelete]    = useState(false);
  const [showAddMember,   setShowAddMember] = useState(false);
  const [confirmRemoveId, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setVisibility(project.visibility);
      setAvatarType(project.avatarType);
      setAvatarValue(project.avatarValue);
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex flex-col px-4 sm:px-6 py-6 max-w-2xl">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-sunken mb-6" />
        <div className="h-64 animate-pulse rounded-lg bg-surface-sunken mb-6" />
        <div className="h-48 animate-pulse rounded-lg bg-surface-sunken" />
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load project settings" onRetry={refetch} />;
  }
  if (!project) return null;

  // Manage-gate per rbac.md §Project actions ("Edit project settings",
  // "Archive a project", "Unarchive a project"): owner / admin always; PM
  // with (public OR membership). Computed after `project` is loaded so the
  // member-list check can run.
  const isProjectMember = project.members.some(m => m.id === user?.id);
  const canManage =
    isAdmin ||
    (role === 'project_manager' && (project.visibility === 'public' || isProjectMember));

  return (
    <div className="flex flex-col">
      <div className="px-4 sm:px-6 py-6 max-w-6xl">
        <div className="mb-6 flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-text-subtle" />
          <h2 className="font-semibold text-text text-lg">Project Settings</h2>
        </div>

        {/* Two-column layout on lg+ using a 5-column grid so the split is
            3/2 instead of the previous 2/1. General + Danger Zone live in
            the LEFT 3 cols (60%, plenty of room for form fields). Members
            live in the RIGHT 2 cols (40%, wider than before so the list
            doesn't crowd against the right edge while still leaving the
            forms space to breathe). Mobile (grid-cols-1) falls back to
            source order: General → Members → Danger (most-used → list →
            destructive). */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* General - desktop: left col, row 1, spans 3 cols (60%) */}
        <section className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden lg:col-start-1 lg:col-span-3 lg:row-start-1">
          {(() => {
            // Defensive guard — the page-level `!project` check earlier
            // doesn't propagate type narrowing into this IIFE, so TS sees
            // `project` as possibly undefined inside startEdit / cancelEdit.
            // This early return is unreachable at runtime (page already
            // bailed if project was null) but it teaches the type system.
            if (!project) return null;
            // View / edit mode for the whole General section. Toggling at the
            // section level (instead of per-field) gives one explicit Save +
            // Cancel pair at the bottom - matches the settings UX rule
            // (read-only by default; explicit Edit reveals form + Save/Cancel).
            const canEditGeneral = !project.archived && isAdmin;
            const hasChanges =
              name.trim() !== project.name ||
              (description.trim() || null) !== (project.description ?? null) ||
              visibility !== project.visibility ||
              avatarType !== project.avatarType ||
              avatarValue !== project.avatarValue;

            // Non-null assertions inside closures — the IIFE's `if (!project)
            // return null;` above narrows the outer scope, but TS doesn't
            // carry that narrowing into nested function declarations
            // (closure captures by reference, value could theoretically be
            // reassigned). Safe at runtime because the page-level guard
            // (and our IIFE guard) already returned null if project is
            // missing — these closures only fire when the JSX below is in
            // the DOM, which only happens after both guards pass.
            function startEdit() {
              setName(project!.name);
              setDescription(project!.description ?? '');
              setVisibility(project!.visibility);
              setAvatarType(project!.avatarType);
              setAvatarValue(project!.avatarValue);
              setEditingGeneral(true);
            }
            function cancelEdit() {
              setName(project!.name);
              setDescription(project!.description ?? '');
              setVisibility(project!.visibility);
              setAvatarType(project!.avatarType);
              setAvatarValue(project!.avatarValue);
              setEditingGeneral(false);
            }
            function saveEdit() {
              updateProject(
                {
                  name: name.trim(),
                  description: description.trim() || undefined,
                  visibility,
                  // Sent as a pair so the two columns can't drift: 'initials'
                  // clears the icon id, 'icon' carries the picked gallery id.
                  avatarType,
                  avatarValue: avatarType === 'icon' ? avatarValue : null,
                },
                { onSuccess: () => setEditingGeneral(false) },
              );
            }

            return (
              <>
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <p className="text-sm font-semibold text-text">General</p>
                  {canEditGeneral && !editingGeneral && (
                    <button
                      onClick={startEdit}
                      className="flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary"
                    >
                      <Pencil size={11} />
                      Edit
                    </button>
                  )}
                </div>

                <div className="px-5 py-5 flex flex-col gap-4">
                  {/* Project icon — preset gallery (v2). Each preset carries its
                      own colour (Jira/Google style), so the picker shows the
                      real coloured tiles and the choice previews 1:1. The
                      "Default" swatch keeps the key-letter tile. Custom image
                      upload is deferred to v3. */}
                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-text-subtle">Icon</label>
                    {editingGeneral ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          {/* Live preview reflects the current picker selection. */}
                          <ProjectAvatar
                            projectKey={project.key}
                            avatarType={avatarType}
                            avatarValue={avatarValue}
                            size="lg"
                          />
                          <p className="text-[11px] text-text-placeholder">
                            Pick a preset icon, or keep the default key letter.
                          </p>
                        </div>
                        {/* Coloured-tile picker: each swatch is the actual
                            ProjectAvatar, so what you click is what you get.
                            Active = primary ring around the tile. */}
                        <div className="flex flex-wrap gap-2">
                          {/* Default (initials) option */}
                          <button
                            type="button"
                            onClick={() => { setAvatarType('initials'); setAvatarValue(null); }}
                            title="Default (key letter)"
                            aria-label="Default (key letter)"
                            aria-pressed={avatarType === 'initials'}
                            className={`rounded-md transition-all ${
                              avatarType === 'initials'
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-raised'
                                : 'opacity-85 hover:opacity-100 hover:scale-105'
                            }`}
                          >
                            <ProjectAvatar
                              projectKey={project.key}
                              avatarType="initials"
                              avatarValue={null}
                              size="md"
                            />
                          </button>
                          {/* Gallery */}
                          {PROJECT_ICONS.map(({ id, label }) => {
                            const active = avatarType === 'icon' && avatarValue === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => { setAvatarType('icon'); setAvatarValue(id); }}
                                title={label}
                                aria-label={label}
                                aria-pressed={active}
                                className={`rounded-md transition-all ${
                                  active
                                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-raised'
                                    : 'opacity-85 hover:opacity-100 hover:scale-105'
                                }`}
                              >
                                <ProjectAvatar
                                  projectKey={project.key}
                                  avatarType="icon"
                                  avatarValue={id}
                                  size="md"
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* Read mode — a compact chip: tile + the chosen icon's
                         name, so it reads cleanly instead of a stray caption. */
                      <div className="flex w-fit items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2">
                        <ProjectAvatar
                          projectKey={project.key}
                          avatarType={project.avatarType}
                          avatarValue={project.avatarValue}
                          size="md"
                        />
                        <span className="text-xs font-medium text-text">
                          {project.avatarType === 'icon'
                            ? `${PROJECT_ICON_MAP[project.avatarValue ?? '']?.label ?? 'Preset'} icon`
                            : 'Default key letter'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Project name */}
                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-text-subtle">Project name</label>
                    {editingGeneral ? (
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                      />
                    ) : (
                      <p className="rounded-md border border-transparent px-3 py-2 text-sm text-text">{project.name}</p>
                    )}
                  </div>

                  {/* Project key - always read-only */}
                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-text-subtle">Project key</label>
                    <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono text-text-placeholder">
                      {project.key}
                    </p>
                    <p className="mt-1 text-[11px] text-text-placeholder">Project key cannot be changed after creation.</p>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-text-subtle">Description</label>
                    {editingGeneral ? (
                      <textarea
                        rows={10}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="What is this project about?"
                        className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary resize-none"
                      />
                    ) : project.description ? (
                      <div className="rounded-md border border-transparent px-3 py-2">
                        <MarkdownRenderer content={project.description} />
                      </div>
                    ) : (
                      <p className="rounded-md border border-transparent px-3 py-2 text-sm italic leading-relaxed text-text-placeholder">
                        No description.
                      </p>
                    )}
                  </div>

                  {/* Visibility */}
                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-text-subtle">Visibility</label>
                    {editingGeneral ? (
                      <div className="flex gap-2">
                        {(['private', 'public'] as const).map(v => {
                          const active = visibility === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setVisibility(v)}
                              className={`flex flex-1 items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors
                                ${active
                                  ? 'border-primary bg-primary-subtle text-primary'
                                  : 'border-border bg-surface text-text-subtle hover:border-primary/40 hover:text-text'
                                }`}
                            >
                              {v === 'private' ? <Lock size={14} className="flex-shrink-0" /> : <Globe size={14} className="flex-shrink-0" />}
                              <div className="text-left">
                                <p className="font-medium capitalize">{v}</p>
                                <p className="text-[11px] text-text-placeholder">
                                  {v === 'private' ? 'Only members can access' : 'All team members can access'}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5 text-sm">
                        {project.visibility === 'private' ? <Lock size={14} className="flex-shrink-0 text-text-subtle" /> : <Globe size={14} className="flex-shrink-0 text-text-subtle" />}
                        <span className="font-medium capitalize text-text">{project.visibility}</span>
                        <span className="text-[11px] text-text-placeholder">
                          · {project.visibility === 'private' ? 'Only members can access' : 'All team members can access'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Save / Cancel - only in edit mode. Save disabled when
                      nothing has changed from the original values. */}
                  {editingGeneral && (
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={cancelEdit}
                        disabled={isSaving}
                        className="rounded border border-border px-4 py-1.5 text-sm font-medium text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={isSaving || !hasChanges || !name.trim()}
                        className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </section>

        {/* Members - desktop: right cols 4-5, spans both rows (full vertical) */}
        <section className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden lg:col-start-4 lg:row-start-1 lg:col-span-2 lg:row-span-2 self-start">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-text">
              Members <span className="text-text-placeholder font-normal">· {project.members.length}</span>
            </p>
            {!project.archived && isAdmin && (
              <button
                onClick={() => setShowAddMember(true)}
                className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
              >
                <Users size={12} />
                Add member
              </button>
            )}
          </div>
          {/* Scrollable member list - caps height so the section never grows
              past the right column's combined height. Long teams just scroll
              inside this container instead of pushing the page down. */}
          <div className="max-h-[640px] overflow-y-auto scrollbar-subtle divide-y divide-border">
            {project.members.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-text-placeholder">
                No members yet - add someone to get started.
              </p>
            )}
            {project.members.map(member => (
              <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                  {member.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text">{member.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[11px] text-text-placeholder">{member.role_name}</span>
                    <span className="rounded border border-border/50 px-1 py-px text-[10px] leading-none text-text-placeholder/60">
                      {member.role_type}
                    </span>
                  </div>
                </div>
                {!project.archived && isAdmin && (
                  confirmRemoveId === member.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => removeMember(member.id, { onSuccess: () => setConfirmRemove(null) })}
                        disabled={isRemoving}
                        className="rounded bg-danger px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-60"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="rounded border border-border px-2.5 py-1 text-xs text-text-subtle transition-colors hover:bg-surface"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(member.id)}
                      className="rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:border-danger/50 hover:text-danger"
                    >
                      Remove
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Danger zone - visible whenever the caller can manage the project.
            Three states inside:
              1. Archived  → Unarchive button (with confirmation) + Delete
              2. Active    → Archive button + Delete (delete is owner/admin only)
            Archive is admin/PM (canManage); Delete is admin only (isAdmin)
            per rbac.md note ³.
            Desktop: left col, row 2 (below General), spans 3 cols. */}
        {canManage && (
          <section className="rounded-lg border border-danger/30 bg-surface-raised shadow-sm overflow-hidden lg:col-start-1 lg:col-span-3 lg:row-start-2">
            <div className="px-5 py-3.5 border-b border-danger/30">
              <p className="text-sm font-semibold text-danger">Danger Zone</p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              {project.archived ? (
                // ── Unarchive ────────────────────────────────────────────────
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-text">Unarchive project</p>
                    <p className="text-xs text-text-subtle mt-0.5">
                      Re-enable editing. Tickets, sprints, and members return to active state.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowUnarchive(true)}
                    disabled={isUnarchiving}
                    className="flex-shrink-0 flex items-center gap-1.5 rounded border border-success/50 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success-subtle disabled:opacity-60"
                  >
                    <ArchiveRestore size={12} />
                    {isUnarchiving ? 'Unarchiving…' : 'Unarchive'}
                  </button>
                </div>
              ) : (
                // ── Archive ──────────────────────────────────────────────────
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-text">Archive project</p>
                    <p className="text-xs text-text-subtle mt-0.5">
                      Make this project read-only. Members can still view tickets and history.
                    </p>
                  </div>
                  <button
                    onClick={() => archiveProject()}
                    disabled={isArchiving}
                    className="flex-shrink-0 flex items-center gap-1.5 rounded border border-warning/50 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning-subtle disabled:opacity-60"
                  >
                    <Archive size={12} />
                    {isArchiving ? 'Archiving…' : 'Archive'}
                  </button>
                </div>
              )}

              {/* Delete sits under archive/unarchive - owner/admin only per rbac.md note ³. */}
              {isAdmin && (
                <>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-text">Delete project</p>
                      <p className="text-xs text-text-subtle mt-0.5">
                        Permanently remove this project and all its data. This cannot be undone.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowDelete(true)}
                      className="flex-shrink-0 flex items-center gap-1.5 rounded border border-danger/50 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-subtle"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        </div>{/* /grid */}

        {/* Unarchive confirmation dialog */}
        {showUnarchive && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={e => { if (e.target === e.currentTarget && !isUnarchiving) setShowUnarchive(false); }}
          >
            <div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-text">
                  <AlertTriangle size={15} className="text-success" />
                  Unarchive {project.name}?
                </h2>
                <button
                  onClick={() => setShowUnarchive(false)}
                  disabled={isUnarchiving}
                  className="rounded p-1 text-text-placeholder hover:bg-surface hover:text-text disabled:opacity-50"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex flex-col gap-4 px-5 py-5">
                <p className="text-sm text-text-subtle leading-relaxed">
                  Reverting will re-enable editing, ticket creation, and sprint management.
                  Are you sure?
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowUnarchive(false)}
                    disabled={isUnarchiving}
                    className="rounded border border-border px-4 py-2 text-sm font-medium text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => unarchiveProject(undefined, { onSuccess: () => setShowUnarchive(false) })}
                    disabled={isUnarchiving}
                    className="flex items-center gap-1.5 rounded bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                  >
                    <ArchiveRestore size={13} />
                    {isUnarchiving ? 'Unarchiving…' : 'Yes, unarchive'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddMember && (
        <AddMemberModal
          projectId={id}
          existingMemberIds={project.members.map(m => m.id)}
          onClose={() => setShowAddMember(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteProjectModal
          projectId={id}
          projectName={project.name}
          isPending={isDeleting}
          onClose={() => setShowDelete(false)}
          onConfirm={(otpCode) =>
            deleteProject(otpCode, {
              onSuccess: () => router.replace(orgRoute(slug, '/dashboard')),
            })
          }
        />
      )}
    </div>
  );
}
