'use client';

import { useState } from 'react';
import { X, ChevronDown } from '@/lib/icons';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/useProjects';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { capitalizeFirst } from '@/lib/text.utils';
import { ProjectAvatar } from '@/components/ui/ProjectAvatar';
import { PROJECT_ICONS } from '@/lib/projectAvatar';

function generateKey(name: string): string {
  const words = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(' ').filter(Boolean);
  if (words.length === 0) return 'PROJ';
  if (words.length === 1) return words[0]!.slice(0, 4);   // single word → first 4 chars e.g. "RAI", "MOBI"
  return words.map(w => w[0]).join('').slice(0, 4);        // multi-word → initials e.g. "MP", "MCP"
}

interface Props {
  onClose: () => void;
}

export function CreateProjectModal({ onClose }: Props) {
  const [name, setName]             = useState('');
  const [key, setKey]               = useState('');
  const [description, setDesc]      = useState('');
  // Default to 'private' per v1-feedback batch (v2-plans.md Phase 2). DB
  // column defaults to 'private' too - keep the UI in step so the visible
  // initial state matches what the schema would pick if the field were omitted.
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [keyTouched, setKeyTouched] = useState(false);
  const [nameError, setNameError]   = useState('');
  // Preset avatar — defaults to the key-letter tile ('initials'); the picker
  // stays collapsed until the user taps "Select icon" so it costs no space.
  const [avatarType, setAvatarType]   = useState<'initials' | 'icon'>('initials');
  const [avatarValue, setAvatarValue] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const router = useRouter();
  const slug = useCurrentSlug() ?? '';
  const { mutate: createProject, isPending } = useCreateProject();

  function handleNameChange(val: string) {
    // Auto-capitalize the first character at create time so a brand-new
    // project name always starts with an uppercase letter. Rename flow
    // (project settings) does NOT auto-capitalize — the user has already
    // chosen the current value there.
    const next = capitalizeFirst(val);
    setName(next);
    if (nameError) setNameError('');
    if (!keyTouched) setKey(generateKey(next));
  }

  function handleKeyChange(val: string) {
    setKeyTouched(true);
    setKey(val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setNameError('Project name is required'); return; }
    createProject(
      {
        name: name.trim(),
        key: key || generateKey(name),
        description: description.trim() || undefined,
        visibility,
        // Only send an icon when one is picked; otherwise the backend keeps
        // the default initials tile (avatarType/avatarValue omitted).
        ...(avatarType === 'icon' && avatarValue ? { avatarType, avatarValue } : {}),
      },
      {
        onSuccess: (project) => {
          onClose();
          router.push(orgRoute(slug, `/projects/${project.id}/board`));
        },
      }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised shadow-xl">

        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text">Create project</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 flex flex-col gap-4">

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              Project name <span className="text-danger">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. Mobile App"
              className={`rounded border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary ${nameError ? 'border-danger' : 'border-border'}`}
            />
            {nameError && <p className="text-xs text-danger">{nameError}</p>}
          </div>

          {/* Icon — collapsed by default to stay minimal. The live tile +
              "Select icon" toggle reveal the same coloured-preset gallery the
              project settings page uses (single source: PROJECT_ICONS). */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              Icon
              <span className="ml-1 font-normal text-text-placeholder text-xs">(optional)</span>
            </label>
            <button
              type="button"
              onClick={() => setIconPickerOpen(o => !o)}
              aria-expanded={iconPickerOpen}
              className="flex w-fit items-center gap-2.5 rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-subtle transition-colors hover:bg-surface"
            >
              <ProjectAvatar
                projectKey={key || 'P'}
                avatarType={avatarType}
                avatarValue={avatarValue}
                size="sm"
              />
              <span>{avatarType === 'icon' ? 'Change icon' : 'Select icon'}</span>
              <ChevronDown size={14} className={`transition-transform ${iconPickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {iconPickerOpen && (
              <div className="flex flex-wrap gap-2 rounded border border-border bg-surface p-2.5">
                {/* Default (initials) option */}
                <button
                  type="button"
                  onClick={() => { setAvatarType('initials'); setAvatarValue(null); }}
                  title="Default (key letter)"
                  aria-label="Default (key letter)"
                  aria-pressed={avatarType === 'initials'}
                  className={`rounded-md transition-all ${
                    avatarType === 'initials'
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
                      : 'opacity-85 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  <ProjectAvatar projectKey={key || 'P'} avatarType="initials" avatarValue={null} size="sm" />
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
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
                          : 'opacity-85 hover:opacity-100 hover:scale-105'
                      }`}
                    >
                      <ProjectAvatar projectKey={key || 'P'} avatarType="icon" avatarValue={id} size="sm" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              Project key
              <span className="ml-1 font-normal text-text-placeholder text-xs">(auto-generated, editable)</span>
            </label>
            <input
              type="text"
              value={key}
              onChange={e => handleKeyChange(e.target.value)}
              placeholder="e.g. MOB"
              className="rounded border border-border bg-surface-raised px-3 py-2 text-sm font-mono text-text outline-none transition-colors duration-150 focus:border-primary"
            />
            <p className="text-xs text-text-placeholder">
              Used as prefix for ticket IDs - {key || 'MOB'}-1, {key || 'MOB'}-2, …
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              Description
              <span className="ml-1 font-normal text-text-placeholder">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="What is this project about?"
              className="resize-none rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Visibility</label>
            <div className="flex overflow-hidden rounded border border-border">
              {(['public', 'private'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={`flex-1 py-2 text-sm transition-colors ${
                    visibility === v
                      ? 'bg-primary font-medium text-white'
                      : 'bg-surface-raised text-text-subtle hover:bg-surface'
                  }`}
                >
                  {v === 'public' ? 'Public' : 'Private'}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-placeholder">
              {visibility === 'public'
                ? 'Visible to all team members.'
                : 'Only visible to assigned members.'}
            </p>
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
              {isPending ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
