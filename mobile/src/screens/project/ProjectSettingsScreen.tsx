import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  SlidersHorizontal,
  Users,
  Trash2,
  Archive,
  ArchiveRestore,
  Pencil,
  Lock,
  Globe,
} from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Card, Txt, Button, Avatar, Divider, withAlpha } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/Input';
import { Loading, ErrorState } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import {
  useProject,
  useUpdateProject,
  useArchiveProject,
  useDeleteProject,
  useRemoveProjectMember,
} from '@/api/projects';
import { useAuthStore, useCurrentRole } from '@/store/authStore';
import { confirm } from '@/lib/confirm';
import { AddMemberModal } from '@/components/modals/AddMemberModal';
import { DeleteProjectModal } from '@/components/modals/DeleteProjectModal';

export function ProjectSettingsScreen({ projectId }: { projectId: string }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { data: project, isLoading, isError, refetch } = useProject(projectId);
  const update = useUpdateProject(projectId);
  const archive = useArchiveProject(projectId);
  const del = useDeleteProject(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const user = useAuthStore(s => s.user);
  const role = useCurrentRole();

  const [editingGeneral, setEditingGeneral] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setVisibility(project.visibility);
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <Loading label="Loading settings…" />;
  if (isError || !project) return <ErrorState message="Failed to load project settings" onRetry={refetch} />;

  // RBAC (mirrors web):
  //   isAdmin = owner/admin → edit General, add/remove members, delete
  //   canManage = isAdmin OR (PM AND (public OR member)) → archive/unarchive
  const isAdmin = role === 'owner' || role === 'admin';
  const isProjectMember = project.members.some(m => m.id === user?.id);
  const canManage = isAdmin || (role === 'project_manager' && (project.visibility === 'public' || isProjectMember));

  const canEditGeneral = !project.archived && isAdmin;
  const hasChanges =
    name.trim() !== project.name ||
    (description.trim() || null) !== (project.description ?? null) ||
    visibility !== project.visibility;

  function cancelEdit() {
    setName(project!.name);
    setDescription(project!.description ?? '');
    setVisibility(project!.visibility);
    setEditingGeneral(false);
  }
  function saveEdit() {
    update.mutate(
      { name: name.trim(), description: description.trim() || undefined, visibility },
      { onSuccess: () => setEditingGeneral(false) },
    );
  }

  const Label = ({ children }: { children: string }) => (
    <Txt variant="subtle" weight="semibold" size={t.fontSize.xs} style={{ marginBottom: 6 }}>
      {children}
    </Txt>
  );

  const ReadBox = ({ children, mono, muted }: { children: React.ReactNode; mono?: boolean; muted?: boolean }) => (
    <View style={{ borderRadius: t.radius.md, borderWidth: 1, borderColor: muted ? t.colors.border : 'transparent', backgroundColor: muted ? t.colors.surface : 'transparent', paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[2] }}>
      <Txt color={muted ? t.colors.textPlaceholder : t.colors.text} style={mono ? { fontFamily: 'monospace' } : undefined}>
        {children}
      </Txt>
    </View>
  );

  const VisCard = ({ v, editing }: { v: 'private' | 'public'; editing: boolean }) => {
    const active = visibility === v;
    const Icon = v === 'private' ? Lock : Globe;
    const desc = v === 'private' ? 'Only members can access' : 'All team members can access';
    if (!editing) return null;
    return (
      <Pressable
        onPress={() => setVisibility(v)}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing[2.5],
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: active ? t.colors.primary : t.colors.border,
          backgroundColor: active ? t.colors.primarySubtle : t.colors.surface,
          paddingHorizontal: t.spacing[3],
          paddingVertical: t.spacing[2.5],
        }}
      >
        <Icon size={15} color={active ? t.colors.primary : t.colors.textSubtle} />
        <View style={{ flex: 1 }}>
          <Txt weight="medium" color={active ? t.colors.primary : t.colors.text} style={{ textTransform: 'capitalize' }}>
            {v}
          </Txt>
          <Txt variant="placeholder" size={t.fontSize.xxs}>
            {desc}
          </Txt>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen scroll refreshing={false} onRefresh={refetch}>
      <View style={{ gap: t.spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
          <SlidersHorizontal size={18} color={t.colors.textSubtle} />
          <Txt variant="heading">Project Settings</Txt>
        </View>

        {/* ── General ── */}
        <Card padded={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[3], borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
            <Txt weight="semibold">General</Txt>
            {canEditGeneral && !editingGeneral ? (
              <Button title="Edit" size="sm" variant="secondary" leftIcon={<Pencil size={12} color={t.colors.text} />} onPress={() => setEditingGeneral(true)} />
            ) : null}
          </View>
          <View style={{ padding: t.spacing[4], gap: t.spacing[4] }}>
            {/* Name */}
            <View>
              <Label>Project name</Label>
              {editingGeneral ? (
                <TextField value={name} onChangeText={setName} />
              ) : (
                <ReadBox>{project.name}</ReadBox>
              )}
            </View>
            {/* Key (always read-only) */}
            <View>
              <Label>Project key</Label>
              <ReadBox mono muted>
                {project.key}
              </ReadBox>
              <Txt variant="placeholder" size={t.fontSize.xxs} style={{ marginTop: 4 }}>
                Project key cannot be changed after creation.
              </Txt>
            </View>
            {/* Description */}
            <View>
              <Label>Description</Label>
              {editingGeneral ? (
                <TextField value={description} onChangeText={setDescription} placeholder="What is this project about?" multiline />
              ) : (
                <ReadBox muted={false}>
                  <Txt color={project.description ? t.colors.text : t.colors.textPlaceholder} style={project.description ? undefined : { fontStyle: 'italic' }}>
                    {project.description || 'No description.'}
                  </Txt>
                </ReadBox>
              )}
            </View>
            {/* Visibility */}
            <View>
              <Label>Visibility</Label>
              {editingGeneral ? (
                <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                  <VisCard v="private" editing />
                  <VisCard v="public" editing />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], borderRadius: t.radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface, paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[2.5] }}>
                  {project.visibility === 'private' ? <Lock size={15} color={t.colors.textSubtle} /> : <Globe size={15} color={t.colors.textSubtle} />}
                  <Txt weight="medium" style={{ textTransform: 'capitalize' }}>
                    {project.visibility}
                  </Txt>
                  <Txt variant="placeholder" size={t.fontSize.xxs}>
                    · {project.visibility === 'private' ? 'Only members can access' : 'All team members can access'}
                  </Txt>
                </View>
              )}
            </View>
            {editingGeneral ? (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing[2] }}>
                <Button title="Cancel" size="sm" variant="secondary" disabled={update.isPending} onPress={cancelEdit} />
                <Button title="Save changes" size="sm" loading={update.isPending} disabled={!hasChanges || !name.trim()} onPress={saveEdit} />
              </View>
            ) : null}
          </View>
        </Card>

        {/* ── Members ── */}
        <Card padded={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[3], borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
            <Txt weight="semibold">
              Members <Txt variant="placeholder">· {project.members.length}</Txt>
            </Txt>
            {!project.archived && isAdmin ? (
              <Button title="Add member" size="sm" leftIcon={<Users size={12} color="#fff" />} onPress={() => setShowAddMember(true)} />
            ) : null}
          </View>
          <View>
            {project.members.length === 0 ? (
              <Txt variant="placeholder" style={{ textAlign: 'center', paddingVertical: t.spacing[6] }}>
                No members yet — add someone to get started.
              </Txt>
            ) : (
              project.members.map((m, idx) => (
                <View key={m.id}>
                  {idx > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[3] }}>
                    <Avatar name={m.name} id={m.id} size={32} />
                    <View style={{ flex: 1 }}>
                      <Txt size={t.fontSize.sm} weight="medium" numberOfLines={1}>
                        {m.name}
                      </Txt>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {m.role_name ? <Txt variant="placeholder" size={t.fontSize.xxs}>{m.role_name}</Txt> : null}
                        <View style={{ borderWidth: 1, borderColor: withAlpha(t.colors.border, 0.5), borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
                          <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder}>
                            {m.role_type}
                          </Txt>
                        </View>
                      </View>
                    </View>
                    {!project.archived && isAdmin ? (
                      confirmRemoveId === m.id ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <Button title="Confirm" size="sm" variant="danger" loading={removeMember.isPending} onPress={() => removeMember.mutate(m.id, { onSuccess: () => setConfirmRemoveId(null) })} />
                          <Button title="Cancel" size="sm" variant="secondary" onPress={() => setConfirmRemoveId(null)} />
                        </View>
                      ) : (
                        <Button title="Remove" size="sm" variant="secondary" onPress={() => setConfirmRemoveId(m.id)} />
                      )
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        </Card>

        {/* ── Danger Zone ── */}
        {canManage ? (
          <Card padded={false} style={{ borderColor: withAlpha(t.colors.danger, 0.3) }}>
            <View style={{ paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[3], borderBottomWidth: 1, borderBottomColor: withAlpha(t.colors.danger, 0.3) }}>
              <Txt weight="semibold" color={t.colors.danger}>
                Danger Zone
              </Txt>
            </View>
            <View style={{ padding: t.spacing[4], gap: t.spacing[3] }}>
              {project.archived ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[3] }}>
                  <View style={{ flex: 1 }}>
                    <Txt weight="medium">Unarchive project</Txt>
                    <Txt variant="subtle" size={t.fontSize.xs}>
                      Re-enable editing. Tickets, sprints, and members return to active state.
                    </Txt>
                  </View>
                  <Button
                    title="Unarchive"
                    size="sm"
                    variant="secondary"
                    loading={archive.isPending}
                    leftIcon={<ArchiveRestore size={12} color={t.colors.success} />}
                    onPress={async () => {
                      if (await confirm({ title: `Unarchive ${project.name}?`, description: 'Re-enables editing, ticket creation, and sprint management.', confirmLabel: 'Yes, unarchive' })) {
                        archive.unarchive();
                      }
                    }}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[3] }}>
                  <View style={{ flex: 1 }}>
                    <Txt weight="medium">Archive project</Txt>
                    <Txt variant="subtle" size={t.fontSize.xs}>
                      Make this project read-only. Members can still view tickets and history.
                    </Txt>
                  </View>
                  <Button
                    title="Archive"
                    size="sm"
                    variant="secondary"
                    loading={archive.isPending}
                    leftIcon={<Archive size={12} color={t.colors.warning} />}
                    onPress={() => archive.archive()}
                  />
                </View>
              )}

              {isAdmin ? (
                <>
                  <Divider />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[3] }}>
                    <View style={{ flex: 1 }}>
                      <Txt weight="medium">Delete project</Txt>
                      <Txt variant="subtle" size={t.fontSize.xs}>
                        Permanently remove this project and all its data. This cannot be undone.
                      </Txt>
                    </View>
                    <Button title="Delete" size="sm" variant="danger" leftIcon={<Trash2 size={12} color="#fff" />} onPress={() => setShowDelete(true)} />
                  </View>
                </>
              ) : null}
            </View>
          </Card>
        ) : null}
      </View>

      {showAddMember ? (
        <AddMemberModal projectId={projectId} existingMemberIds={project.members.map(m => m.id)} onClose={() => setShowAddMember(false)} />
      ) : null}
      {showDelete ? (
        <DeleteProjectModal
          projectId={projectId}
          projectName={project.name}
          isPending={del.isPending}
          onClose={() => setShowDelete(false)}
          onConfirm={otpCode => del.mutate(otpCode, { onSuccess: () => nav.navigate('Shell', { screen: 'Tabs', params: { screen: 'Projects' } }) })}
        />
      ) : null}
    </Screen>
  );
}
