import React, { useMemo, useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Trash2, MessageSquare, Copy, CornerUpLeft, Link2, Plus, ChevronDown, Reply, Pencil, Check, X } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, Button, Avatar, Divider, withAlpha } from '@/components/ui/primitives';
import { Picker, type PickerOption } from '@/components/ui/Picker';
import { TypeIcon, PriorityIcon, StatusDot, StatusChip } from '@/components/ui/chips';
import { MentionTextarea, MentionText } from '@/components/ui/MentionTextarea';
import { Loading, ErrorState } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { useTicket, useUpdateTicket, useDeleteTicket } from '@/api/tickets';
import { useAddComment, useEditComment, useDeleteComment } from '@/api/comments';
import { useAuthStore, useCurrentRole } from '@/store/authStore';
import { canEditTicket, isManagerPlus, isAdminPlus, canCreateTicketInProject } from '@/lib/permissions';
import { confirm } from '@/lib/confirm';
import { copyToClipboard } from '@/lib/clipboard';
import { toast } from '@/lib/toast';
import { formatDateTime } from '@/lib/dates';
import { TYPE_META, PRIORITY_META, STATUS_META, TICKET_TYPES, PRIORITIES, STATUSES } from '@/lib/ticketMeta';
import { isLiveSprint } from '@/lib/sprintUtils';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import type { TicketType, Priority, TicketStatus, Comment, Member } from '@/types/api.types';

const ROOTS_CAP = 10;
const REPLIES_CAP = 2;

export function TicketDetailScreen({ projectId, ticketKey }: { projectId: string; ticketKey: string }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const userId = useAuthStore(s => s.user?.id) ?? '';
  const role = useCurrentRole();

  const { data: ticket, isLoading, isError, refetch } = useTicket(projectId, ticketKey);
  const { data: project } = useProject(projectId);
  const update = useUpdateTicket(projectId, ticket?.id ?? '', ticketKey);
  const del = useDeleteTicket(projectId);
  const addComment = useAddComment(projectId, ticket?.id ?? '', ticketKey);
  const editComment = useEditComment(projectId, ticket?.id ?? '', ticketKey);
  const deleteComment = useDeleteComment(projectId, ticket?.id ?? '', ticketKey);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [comment, setComment] = useState('');
  const [commentMentionIds, setCommentMentionIds] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyMentionIds, setReplyMentionIds] = useState<string[]>([]);
  const [showAllRoots, setShowAllRoots] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  const [linkingParent, setLinkingParent] = useState(false);
  const [addingSub, setAddingSub] = useState(false);

  const members = project?.members ?? [];
  const memberNames = useMemo(() => members.map(m => m.name), [members]);

  if (isLoading) return <Screen><Loading label="Loading ticket…" /></Screen>;
  if (isError || !ticket)
    return <Screen><ErrorState message={`Ticket ${ticketKey} doesn't exist or was deleted.`} onRetry={refetch} /></Screen>;

  const canEdit = canEditTicket(ticket.reporter.id, ticket.assignee?.id ?? null, userId, role);
  const canManage = isManagerPlus(role);
  const isOrgAdmin = isAdminPlus(role);
  const canAddSub = project ? canCreateTicketInProject(project, userId, role) : false;

  const allTickets = project ? [...project.backlog, ...project.sprints.flatMap(s => s.tickets)] : [];
  const ticketByKey = new Map(allTickets.map(tk => [tk.key, tk]));
  const parentTicket = ticket.parentKey ? ticketByKey.get(ticket.parentKey) : undefined;
  const liveSprints = (project?.sprints ?? []).filter(isLiveSprint);

  const rootComments = (ticket.comments ?? []).filter(c => !c.parentCommentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const repliesOf = (id: string) => (ticket.comments ?? []).filter(c => c.parentCommentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const visibleRoots = showAllRoots ? rootComments : rootComments.slice(0, ROOTS_CAP);

  const canDeleteComment = (c: Comment) =>
    c.author.id === userId || isOrgAdmin || ticket.reporter.id === userId || ticket.assignee?.id === userId;

  const typeOpts: PickerOption<TicketType>[] = TICKET_TYPES.map(v => ({ value: v, label: TYPE_META[v].label, leading: <TypeIcon type={v} /> }));
  const prioOpts: PickerOption<Priority>[] = PRIORITIES.map(v => ({ value: v, label: PRIORITY_META[v].label, leading: <PriorityIcon priority={v} /> }));
  const statusOpts: PickerOption<TicketStatus>[] = STATUSES.map(v => ({ value: v, label: STATUS_META[v].label, leading: <StatusDot status={v} /> }));
  const assigneeOpts: PickerOption<string>[] = [{ value: '', label: 'Unassigned' }, ...members.map(m => ({ value: m.id, label: m.name }))];
  const sprintOpts: PickerOption<string>[] = [{ value: '', label: 'Backlog' }, ...liveSprints.map(s => ({ value: s.id, label: s.name }))];
  const parentOpts: PickerOption<string>[] = [
    { value: '', label: 'No parent' },
    ...allTickets.filter(tk => tk.key !== ticket.key).map(tk => ({ value: tk.key, label: `${tk.key} — ${tk.title}`, leading: <TypeIcon type={tk.type} /> })),
  ];

  function saveTitle() {
    if (titleDraft.trim().length < 2) {
      toast.error('Title must be at least 2 characters');
      return;
    }
    update.mutate({ title: titleDraft.trim() });
    setEditingTitle(false);
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={{ gap: 4 }}>
      <Txt variant="subtle" size={t.fontSize.xs} weight="medium">
        {label}
      </Txt>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={ticket.key} subtitle={project?.name} onBack={() => nav.goBack()} showThemeToggle={false} />
      <Screen scroll>
        <View style={{ gap: t.spacing[4] }}>
          {/* Header: type pill + key + copy + parent + status */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: withAlpha(t.colors[TYPE_META[ticket.type].colorKey], 0.12), borderRadius: t.radius.sm, paddingHorizontal: 6, paddingVertical: 3 }}>
              <TypeIcon type={ticket.type} size={12} />
              <Txt size={t.fontSize.xs} weight="semibold" color={t.colors[TYPE_META[ticket.type].colorKey]}>
                {ticket.key}
              </Txt>
              <Pressable onPress={() => copyToClipboard(ticket.key, `Copied ${ticket.key}`)} hitSlop={6}>
                <Copy size={12} color={t.colors.textSubtle} />
              </Pressable>
            </View>
            {ticket.parentKey ? (
              <Pressable onPress={() => nav.push('TicketDetail', { projectId, ticketKey: ticket.parentKey })} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <CornerUpLeft size={12} color={t.colors.textSubtle} />
                <Txt variant="link" size={t.fontSize.xs}>{ticket.parentKey}</Txt>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <StatusChip status={ticket.status} size="sm" />
          </View>

          {/* Title */}
          {editingTitle && canEdit ? (
            <View style={{ gap: t.spacing[2] }}>
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                autoFocus
                multiline
                style={{ fontSize: t.fontSize.xl, fontWeight: '700', color: t.colors.text, borderWidth: 1, borderColor: t.colors.borderFocus, borderRadius: t.radius.md, padding: t.spacing[2] }}
              />
              <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                <Button title="Save" size="sm" onPress={saveTitle} />
                <Button title="Cancel" size="sm" variant="secondary" onPress={() => setEditingTitle(false)} />
              </View>
            </View>
          ) : (
            <Pressable onPress={() => { if (canEdit) { setTitleDraft(ticket.title); setEditingTitle(true); } }}>
              <Txt variant="title">{ticket.title}</Txt>
            </Pressable>
          )}

          {/* Description (shown first, above the details) */}
          <View style={{ gap: t.spacing[2] }}>
            <Txt variant="heading">Description</Txt>
            {editingDesc && canEdit ? (
              <View style={{ gap: t.spacing[2] }}>
                <TextInput value={descDraft} onChangeText={setDescDraft} autoFocus multiline placeholder="Add a description…" placeholderTextColor={t.colors.textPlaceholder} style={{ minHeight: 100, fontSize: t.fontSize.sm, color: t.colors.text, borderWidth: 1, borderColor: t.colors.borderFocus, borderRadius: t.radius.md, padding: t.spacing[3], textAlignVertical: 'top' }} />
                <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                  <Button title="Save" size="sm" onPress={() => { update.mutate({ description: descDraft }); setEditingDesc(false); }} />
                  <Button title="Cancel" size="sm" variant="secondary" onPress={() => setEditingDesc(false)} />
                </View>
              </View>
            ) : (
              <Pressable onPress={() => { if (canEdit) { setDescDraft(ticket.description ?? ''); setEditingDesc(true); } }}>
                <Card>
                  <Txt variant={ticket.description ? 'body' : 'placeholder'} style={ticket.description ? undefined : { fontStyle: 'italic' }}>
                    {ticket.description || (canEdit ? 'No description — click to add one.' : 'No description.')}
                  </Txt>
                </Card>
              </Pressable>
            )}
          </View>

          {/* Details */}
          <Card style={{ gap: t.spacing[3] }}>
            <View style={{ flexDirection: 'row', gap: t.spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Field label="Status"><Picker value={ticket.status} options={statusOpts} onChange={s => update.mutate({ status: s })} disabled={!canEdit} title="Status" /></Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Priority"><Picker value={ticket.priority} options={prioOpts} onChange={p => update.mutate({ priority: p })} disabled={!canEdit} title="Priority" /></Field>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: t.spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Field label="Type"><Picker value={ticket.type} options={typeOpts} onChange={ty => update.mutate({ type: ty })} disabled={!canEdit} title="Type" /></Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Assignee"><Picker value={ticket.assignee?.id ?? ''} options={assigneeOpts} onChange={a => update.mutate({ assigneeId: a || null })} disabled={!canEdit} searchable title="Assignee" placeholder="Unassigned" /></Field>
              </View>
            </View>
            <Field label="Sprint">
              {canManage ? (
                <Picker value={ticket.sprintId ?? ''} options={sprintOpts} onChange={s => update.mutate({ sprintId: s || null })} title="Sprint" placeholder="Backlog" />
              ) : (
                <Txt size={t.fontSize.sm}>{liveSprints.find(s => s.id === ticket.sprintId)?.name ?? 'Backlog'}</Txt>
              )}
            </Field>
            <Divider />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: t.spacing[2] }}>
              <Field label="Reporter">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Avatar name={ticket.reporter.name} id={ticket.reporter.id} size={20} />
                  <Txt size={t.fontSize.xs}>{ticket.reporter.name}</Txt>
                </View>
              </Field>
              <Field label="Created"><Txt size={t.fontSize.xs} variant="subtle">{formatDateTime(ticket.createdAt)}</Txt></Field>
              <Field label="Updated"><Txt size={t.fontSize.xs} variant="subtle">{formatDateTime(ticket.updatedAt)}</Txt></Field>
            </View>
          </Card>

          {/* Type-specific fields */}
          {(ticket.type === 'story' || ticket.type === 'bug' || ticket.type === 'epic') ? (
            <TypeSpecificFields ticket={ticket} canEdit={canEdit} onUpdate={payload => update.mutate(payload)} />
          ) : null}

          {/* Linked tickets */}
          {parentTicket || ticket.subTicketKeys.length > 0 || canEdit || canAddSub ? (
            <View style={{ gap: t.spacing[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Txt variant="heading">Linked tickets</Txt>
                <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                  {canEdit ? (
                    <Pressable onPress={() => setLinkingParent(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Link2 size={13} color={t.colors.primary} />
                      <Txt variant="link" size={t.fontSize.xs}>{ticket.parentKey ? 'Change parent' : 'Link to parent'}</Txt>
                    </Pressable>
                  ) : null}
                  {canAddSub ? (
                    <Pressable onPress={() => setAddingSub(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Plus size={13} color={t.colors.primary} />
                      <Txt variant="link" size={t.fontSize.xs}>Add sub-ticket</Txt>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {linkingParent && canEdit ? (
                <Picker
                  value={ticket.parentKey ?? ''}
                  options={parentOpts}
                  onChange={v => { update.mutate({ parentKey: v || null }); setLinkingParent(false); }}
                  title="Link to parent"
                  searchable
                  placeholder="No parent"
                />
              ) : null}
              {parentTicket ? (
                <Pressable onPress={() => nav.push('TicketDetail', { projectId, ticketKey: parentTicket.key })}>
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                    <TypeIcon type={parentTicket.type} />
                    <Txt size={t.fontSize.xs} color={t.colors.textSubtle} weight="semibold">{parentTicket.key}</Txt>
                    <Txt style={{ flex: 1 }} numberOfLines={1}>{parentTicket.title}</Txt>
                    <Link2 size={13} color={t.colors.textPlaceholder} />
                  </Card>
                </Pressable>
              ) : null}
              {ticket.subTicketKeys.length > 0 ? (
                <Card padded={false} style={{ paddingHorizontal: t.spacing[3] }}>
                  <Txt variant="placeholder" size={t.fontSize.xxs} weight="semibold" style={{ paddingTop: t.spacing[2], textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Children ({ticket.subTicketKeys.length})
                  </Txt>
                  {ticket.subTicketKeys.map(k => {
                    const sub = ticketByKey.get(k);
                    return (
                      <Pressable key={k} onPress={() => nav.push('TicketDetail', { projectId, ticketKey: k })} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingVertical: t.spacing[2.5] }}>
                        {sub ? <TypeIcon type={sub.type} /> : null}
                        <Txt size={t.fontSize.xs} color={t.colors.textSubtle} weight="semibold" style={{ width: 64 }}>{k}</Txt>
                        <Txt style={{ flex: 1 }} numberOfLines={1}>{sub?.title ?? ''}</Txt>
                        {sub ? <StatusChip status={sub.status} size="sm" /> : null}
                        {sub?.assignee ? <Avatar name={sub.assignee.name} id={sub.assignee.id} size={18} /> : null}
                      </Pressable>
                    );
                  })}
                </Card>
              ) : null}
            </View>
          ) : null}

          {/* Comments */}
          <View style={{ gap: t.spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={16} color={t.colors.text} />
              <Txt variant="heading">Activity · {rootComments.length}</Txt>
            </View>
            <Card style={{ gap: t.spacing[2] }}>
              <MentionTextarea
                value={comment}
                onChange={setComment}
                onMentionSelect={id => setCommentMentionIds(prev => prev.includes(id) ? prev : [...prev, id])}
                members={members}
                placeholder="Add a comment… type @ to mention someone"
              />
              {comment.trim().length > 0 ? (
                <Button
                  title={addComment.isPending ? 'Posting…' : 'Comment'}
                  size="sm"
                  loading={addComment.isPending}
                  onPress={() =>
                    addComment.mutate(
                      { content: comment.trim(), mentions: commentMentionIds.length ? commentMentionIds : undefined },
                      { onSuccess: () => { setComment(''); setCommentMentionIds([]); } },
                    )
                  }
                />
              ) : null}
            </Card>

            {visibleRoots.map(c => {
              const replies = repliesOf(c.id);
              const threadExpanded = expandedThreads[c.id];
              const visibleReplies = threadExpanded ? replies : replies.slice(0, REPLIES_CAP);
              return (
                <Card key={c.id} style={{ gap: t.spacing[2] }}>
                  <CommentBody comment={c} memberNames={memberNames} members={members} canEdit={c.author.id === userId} canDelete={canDeleteComment(c)} onEdit={(id, payload) => editComment.mutate({ commentId: id, payload })} onDelete={async () => { if (await confirm({ title: 'Delete this comment?', description: `This will permanently remove the comment from ${c.author.name}. Replies to this comment will become root comments. You can't undo this.`, destructive: true, confirmLabel: 'Delete comment', cancelLabel: 'Keep comment' })) deleteComment.mutate(c.id); }} onReply={() => { setReplyingTo(c.id); setReplyDraft(''); }} />

                  {visibleReplies.map(r => (
                    <View key={r.id} style={{ marginLeft: t.spacing[4], paddingLeft: t.spacing[3], borderLeftWidth: 2, borderLeftColor: t.colors.borderSubtle, gap: 4 }}>
                      <CommentBody comment={r} memberNames={memberNames} members={members} small canEdit={r.author.id === userId} canDelete={canDeleteComment(r)} onEdit={(id, payload) => editComment.mutate({ commentId: id, payload })} onDelete={async () => { if (await confirm({ title: 'Delete this comment?', description: `This will permanently remove the comment from ${r.author.name}. You can't undo this.`, destructive: true, confirmLabel: 'Delete comment', cancelLabel: 'Keep comment' })) deleteComment.mutate(r.id); }} onReply={() => { setReplyingTo(c.id); setReplyDraft(`@${r.author.name} `); }} />
                    </View>
                  ))}
                  {replies.length > REPLIES_CAP ? (
                    <Pressable onPress={() => setExpandedThreads(s => ({ ...s, [c.id]: !threadExpanded }))} style={{ marginLeft: t.spacing[4] }}>
                      <Txt variant="link" size={t.fontSize.xs}>{threadExpanded ? 'Show less' : `Show ${replies.length - REPLIES_CAP} more replies`}</Txt>
                    </Pressable>
                  ) : null}

                  {replyingTo === c.id ? (
                    <View style={{ marginLeft: t.spacing[4], gap: t.spacing[2] }}>
                      <MentionTextarea
                        value={replyDraft}
                        onChange={setReplyDraft}
                        onMentionSelect={id => setReplyMentionIds(prev => prev.includes(id) ? prev : [...prev, id])}
                        members={members}
                        placeholder="Reply in this thread…"
                        autoFocus
                        minHeight={44}
                      />
                      <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                        <Button
                          title={addComment.isPending ? 'Posting…' : 'Reply'}
                          size="sm"
                          loading={addComment.isPending}
                          disabled={!replyDraft.trim()}
                          onPress={() =>
                            addComment.mutate(
                              { content: replyDraft.trim(), parentCommentId: c.id, mentions: replyMentionIds.length ? replyMentionIds : undefined },
                              { onSuccess: () => { setReplyDraft(''); setReplyMentionIds([]); setReplyingTo(null); } },
                            )
                          }
                        />
                        <Button title="Cancel" size="sm" variant="secondary" onPress={() => { setReplyingTo(null); setReplyMentionIds([]); }} />
                      </View>
                    </View>
                  ) : null}
                </Card>
              );
            })}
            {rootComments.length > ROOTS_CAP && !showAllRoots ? (
              <Pressable onPress={() => setShowAllRoots(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: t.spacing[2] }}>
                <ChevronDown size={14} color={t.colors.primary} />
                <Txt variant="link" size={t.fontSize.xs}>Show all {rootComments.length} comments</Txt>
              </Pressable>
            ) : null}
          </View>

          {canManage ? (
            <Button
              title="Delete ticket"
              variant="danger"
              fullWidth
              leftIcon={<Trash2 size={16} color="#fff" />}
              onPress={async () => {
                if (await confirm({ title: `Delete ${ticket.key}?`, description: 'Permanently delete this ticket and all its comments. This cannot be undone.', destructive: true, confirmLabel: 'Delete ticket' })) {
                  del.mutate(ticket.id, { onSuccess: () => nav.goBack() });
                }
              }}
            />
          ) : null}
        </View>
      </Screen>

      {addingSub && project ? <CreateTicketModal project={project} initialParentKey={ticket.key} onClose={() => setAddingSub(false)} /> : null}
    </View>
  );
}

function TypeSpecificFields({
  ticket,
  canEdit,
  onUpdate,
}: {
  ticket: import('@/types/api.types').Ticket;
  canEdit: boolean;
  onUpdate: (payload: import('@/types/api.types').UpdateTicketPayload) => void;
}) {
  const t = useTheme();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function startEdit(field: string, current: string | number | null | undefined) {
    setEditingField(field);
    setDraft(current != null ? String(current) : '');
  }

  function saveField(field: string) {
    if (field === 'story_points') {
      const val = draft.trim() ? parseInt(draft.trim(), 10) : null;
      onUpdate({ story_points: isNaN(val as number) ? null : val });
    } else {
      onUpdate({ [field]: draft.trim() || null } as any);
    }
    setEditingField(null);
  }

  const EditableTextRow = ({ label, field, value, placeholder, multiline }: { label: string; field: string; value: string | null | undefined; placeholder: string; multiline?: boolean }) => (
    <View style={{ gap: 4 }}>
      <Txt variant="subtle" size={t.fontSize.xs} weight="medium">{label}</Txt>
      {editingField === field ? (
        <View style={{ gap: t.spacing[2] }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            multiline={multiline}
            placeholder={placeholder}
            placeholderTextColor={t.colors.textPlaceholder}
            style={{ fontSize: t.fontSize.sm, color: t.colors.text, borderWidth: 1, borderColor: t.colors.borderFocus, borderRadius: t.radius.md, padding: t.spacing[2], minHeight: multiline ? 80 : undefined, textAlignVertical: multiline ? 'top' : undefined }}
          />
          <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
            <Button title="Save" size="sm" onPress={() => saveField(field)} />
            <Button title="Cancel" size="sm" variant="secondary" onPress={() => setEditingField(null)} />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => { if (canEdit) startEdit(field, value); }}>
          <Txt variant={value ? 'body' : 'placeholder'} size={t.fontSize.sm} style={value ? undefined : { fontStyle: 'italic' }}>
            {value || (canEdit ? `Tap to add ${label.toLowerCase()}` : `No ${label.toLowerCase()}`)}
          </Txt>
        </Pressable>
      )}
    </View>
  );

  return (
    <Card style={{ gap: t.spacing[3] }}>
      <Txt variant="heading">
        {ticket.type === 'story' ? 'Story details' : ticket.type === 'bug' ? 'Bug details' : 'Epic details'}
      </Txt>

      {ticket.type === 'story' ? (
        <>
          <View style={{ gap: 4 }}>
            <Txt variant="subtle" size={t.fontSize.xs} weight="medium">Story points</Txt>
            {editingField === 'story_points' ? (
              <View style={{ gap: t.spacing[2] }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={t.colors.textPlaceholder}
                  style={{ fontSize: t.fontSize.sm, color: t.colors.text, borderWidth: 1, borderColor: t.colors.borderFocus, borderRadius: t.radius.md, padding: t.spacing[2], width: 80 }}
                />
                <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                  <Button title="Save" size="sm" onPress={() => saveField('story_points')} />
                  <Button title="Cancel" size="sm" variant="secondary" onPress={() => setEditingField(null)} />
                </View>
              </View>
            ) : (
              <Pressable onPress={() => { if (canEdit) startEdit('story_points', ticket.story_points); }}>
                <Txt size={t.fontSize.sm} variant={ticket.story_points != null ? 'body' : 'placeholder'} style={ticket.story_points != null ? undefined : { fontStyle: 'italic' }}>
                  {ticket.story_points != null ? String(ticket.story_points) : (canEdit ? 'Tap to set story points' : 'Not set')}
                </Txt>
              </Pressable>
            )}
          </View>
          <EditableTextRow label="Acceptance criteria" field="acceptance_criteria" value={ticket.acceptance_criteria} placeholder="Given / When / Then…" multiline />
        </>
      ) : null}

      {ticket.type === 'bug' ? (
        <>
          <EditableTextRow label="Steps to reproduce" field="steps_to_reproduce" value={ticket.steps_to_reproduce} placeholder="1. Open… 2. Tap… 3. See…" multiline />
          <EditableTextRow label="Environment" field="environment" value={ticket.environment} placeholder="e.g. iOS 17, Android 14" />
        </>
      ) : null}

      {ticket.type === 'epic' ? (
        <>
          <EditableTextRow label="Epic name" field="epic_name" value={ticket.epic_name} placeholder="Short label for this epic" />
          <EpicColorRow color={ticket.epic_color ?? null} canEdit={canEdit} onUpdate={onUpdate} />
        </>
      ) : null}
    </Card>
  );
}

const EPIC_COLORS = [
  '#0052CC', '#8B5CF6', '#36B37E', '#FF8B00',
  '#DE350B', '#EC4899', '#00B8D9', '#FFAB00',
];

function EpicColorRow({
  color,
  canEdit,
  onUpdate,
}: {
  color: string | null;
  canEdit: boolean;
  onUpdate: (payload: import('@/types/api.types').UpdateTicketPayload) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Txt variant="subtle" size={t.fontSize.xs} weight="medium">Epic color</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[2] }}>
        {EPIC_COLORS.map(c => {
          const selected = color === c;
          return (
            <Pressable
              key={c}
              onPress={() => { if (canEdit) onUpdate({ epic_color: selected ? null : c }); }}
              style={{
                width: 28,
                height: 28,
                borderRadius: t.radius.full,
                backgroundColor: c,
                borderWidth: selected ? 3 : 1.5,
                borderColor: selected ? t.colors.text : withAlpha(c, 0.4),
                opacity: canEdit ? 1 : 0.5,
              }}
            />
          );
        })}
        {color && !EPIC_COLORS.includes(color) ? (
          <View style={{ width: 28, height: 28, borderRadius: t.radius.full, backgroundColor: color, borderWidth: 3, borderColor: t.colors.text }} />
        ) : null}
      </View>
      {color ? (
        <Txt variant="placeholder" size={t.fontSize.xxs}>{color}</Txt>
      ) : (
        <Txt variant="placeholder" size={t.fontSize.xxs} style={{ fontStyle: 'italic' }}>
          {canEdit ? 'No color — tap a swatch to set one.' : 'No color set.'}
        </Txt>
      )}
    </View>
  );
}

function CommentBody({
  comment: c, memberNames, members, canEdit, canDelete, onEdit, onDelete, onReply, small,
}: {
  comment: Comment;
  memberNames: string[];
  members: Member[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (id: string, payload: { content: string; mentions?: string[] }) => void;
  onDelete: () => void;
  onReply: () => void;
  small?: boolean;
}) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editMentionIds, setEditMentionIds] = useState<string[]>([]);

  function startEdit() {
    setDraft(c.content);
    setEditMentionIds([]);
    setEditing(true);
  }

  function submitEdit() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    onEdit(c.id, { content: trimmed, mentions: editMentionIds.length ? editMentionIds : undefined });
    setEditing(false);
  }

  return (
    <View style={{ gap: t.spacing[1.5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Avatar name={c.author.name} id={c.author.id} size={small ? 18 : 22} />
        <Txt weight="semibold" size={small ? t.fontSize.xxs : t.fontSize.xs}>{c.author.name}</Txt>
        <Txt variant="placeholder" size={t.fontSize.xxs}>{formatDateTime(c.createdAt)}</Txt>
        {c.updatedAt && c.updatedAt !== c.createdAt ? (
          <Txt variant="placeholder" size={t.fontSize.xxs}>(edited)</Txt>
        ) : null}
      </View>

      {editing ? (
        <View style={{ gap: t.spacing[2] }}>
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            onMentionSelect={id => setEditMentionIds(prev => prev.includes(id) ? prev : [...prev, id])}
            members={members}
            autoFocus
            minHeight={44}
          />
          <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
            <Pressable
              onPress={submitEdit}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: t.radius.md, backgroundColor: t.colors.primary }}
            >
              <Check size={13} color={t.colors.primaryText} />
              <Txt size={t.fontSize.xs} weight="medium" color={t.colors.primaryText}>Save</Txt>
            </Pressable>
            <Pressable
              onPress={() => setEditing(false)}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceSunken }}
            >
              <X size={13} color={t.colors.textSubtle} />
              <Txt size={t.fontSize.xs} weight="medium" color={t.colors.textSubtle}>Cancel</Txt>
            </Pressable>
          </View>
        </View>
      ) : (
        <MentionText text={c.content} memberNames={memberNames} />
      )}

      {!editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], marginTop: 2 }}>
          <Pressable
            onPress={onReply}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceSunken }}
          >
            <Reply size={14} color={t.colors.primary} />
            <Txt variant="link" size={t.fontSize.xs} weight="medium">Reply</Txt>
          </Pressable>
          {canEdit ? (
            <Pressable
              onPress={startEdit}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceSunken }}
            >
              <Pencil size={14} color={t.colors.textSubtle} />
              <Txt size={t.fontSize.xs} weight="medium" color={t.colors.textSubtle}>Edit</Txt>
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: t.radius.md, backgroundColor: withAlpha(t.colors.danger, 0.1) }}
            >
              <Trash2 size={14} color={t.colors.danger} />
              <Txt size={t.fontSize.xs} weight="medium" color={t.colors.danger}>Delete</Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
