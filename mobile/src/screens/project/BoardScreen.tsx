import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { Plus, CornerUpLeft, GitBranch, Archive, Zap } from 'lucide-react-native';
import { Txt, Card, Avatar, Button, withAlpha } from '@/components/ui/primitives';
import { TypeIcon, PriorityIcon, StatusDot, SprintPill } from '@/components/ui/chips';
import { Loading, ErrorState } from '@/components/ui/states';
import { ProjectFilterBar, ticketMatchesFilters, EMPTY_FILTERS, type ProjectFilters } from '@/components/shell/ProjectFilterBar';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { useMoveTicket } from '@/api/tickets';
import { useAuthStore, useCurrentRole } from '@/store/authStore';
import { STATUS_META, STATUSES } from '@/lib/ticketMeta';
import { canCreateTicketInProject, isManagerPlus, createTicketBlockedReason } from '@/lib/permissions';
import { MESSAGES } from '@/lib/messages';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import type { Ticket, TicketStatus } from '@/types/api.types';

type Columns = Record<TicketStatus, Ticket[]>;
type Bound = { status: string; top: number; bottom: number };

export function BoardScreen({ projectId }: { projectId: string }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { data: project, isLoading, isError, refetch } = useProject(projectId);
  const move = useMoveTicket(projectId);
  const userId = useAuthStore(s => s.user?.id) ?? '';
  const role = useCurrentRole();
  const [createStatus, setCreateStatus] = useState<TicketStatus | null>(null);
  const [userFilters, setUserFilters] = useState<ProjectFilters | null>(null);
  const [pendingMoves, setPendingMoves] = useState<Record<string, TicketStatus>>({});

  const sprint = project?.sprints.find(s => s.status === 'active');

  // Default-to-me computed synchronously → no unfiltered flash on first paint.
  const defaultFilters = useMemo<ProjectFilters>(() => {
    if (project && userId && project.members.some(m => m.id === userId)) return { type: 'all', assignees: [userId] };
    return EMPTY_FILTERS;
  }, [project, userId]);
  const filters = userFilters ?? defaultFilters;

  const ticketsKey = sprint?.tickets.map(tk => `${tk.id}:${tk.status}`).join(',') ?? '';
  useEffect(() => {
    if (!sprint) return;
    setPendingMoves(prev => {
      let changed = false;
      const next = { ...prev };
      for (const tk of sprint.tickets) {
        if (next[tk.id] !== undefined && tk.status === next[tk.id]) {
          delete next[tk.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ticketsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo<Columns>(() => {
    const build: Columns = { todo: [], in_progress: [], in_review: [], done: [] };
    if (!sprint) return build;
    for (const tk of sprint.tickets) {
      if (!ticketMatchesFilters(tk, filters)) continue;
      const st = pendingMoves[tk.id] ?? tk.status;
      build[st].push(st === tk.status ? tk : { ...tk, status: st });
    }
    return build;
  }, [sprint, filters, pendingMoves]);

  // ── Drag state (vertical between lanes) ───────────────────────────────────────
  const rootRef = useRef<View | null>(null);
  const laneRefs = useRef<Record<TicketStatus, View | null>>({ todo: null, in_progress: null, in_review: null, done: null });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const absX = useSharedValue(0);
  const absY = useSharedValue(0);
  const rootX = useSharedValue(0);
  const rootY = useSharedValue(0);
  const bounds = useSharedValue<Bound[]>([]);
  const hovered = useSharedValue<string | null>(null);
  const CARD_W = Math.min(260, Math.round(width * 0.68));

  if (isLoading) return <Loading label="Loading board…" />;
  if (isError || !project) return <ErrorState message="Failed to load board" onRetry={refetch} />;

  const canCreate = !project.archived && canCreateTicketInProject(project, userId, role);
  const createBlocked = project.archived ? 'Project is archived' : createTicketBlockedReason(project, userId, role);
  const isManager = isManagerPlus(role);
  const canMoveTicket = (tk: Ticket) => !project.archived && (isManager || tk.assignee?.id === userId || tk.reporter.id === userId);

  // ── No active sprint ──────────────────────────────────────────────────────────
  if (!sprint) {
    const msg = project.archived
      ? MESSAGES.board.noActiveSprint_archived
      : project.sprints.length === 0
      ? MESSAGES.board.noSprints
      : MESSAGES.board.noActiveSprint;
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
        <View style={{ borderBottomWidth: 1, borderBottomColor: t.colors.border, backgroundColor: t.colors.surfaceRaised }}>
          <ProjectFilterBar members={project.members} currentUserId={userId} value={filters} onChange={setUserFilters} />
        </View>
        {project.archived ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], margin: t.spacing[4], borderRadius: t.radius.md, borderWidth: 1, borderColor: withAlpha(t.colors.warning, 0.4), backgroundColor: withAlpha(t.colors.warning, 0.1), padding: t.spacing[3] }}>
            <Archive size={15} color={t.colors.warning} />
            <Txt variant="subtle" size={t.fontSize.xs} style={{ flex: 1 }}>This project is archived and read-only.</Txt>
          </View>
        ) : null}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing[8] }}>
          <Zap size={32} color={t.colors.border} />
          <Txt weight="semibold" style={{ marginTop: t.spacing[2] }}>{msg.title}</Txt>
          <Txt variant="subtle" size={t.fontSize.sm} style={{ textAlign: 'center', marginTop: 4, maxWidth: 280 }}>{msg.description}</Txt>
          {'cta' in msg && !project.archived ? (
            <Button title={(msg as { cta: string }).cta} onPress={() => nav.navigate('Project', { projectId, screen: 'Backlog' })} style={{ marginTop: t.spacing[4], alignSelf: 'center' }} />
          ) : null}
        </View>
      </View>
    );
  }

  // ── Drag helpers ──────────────────────────────────────────────────────────────
  function beginDrag(ticketId: string) {
    setDragId(ticketId);
    setDragging(true);
    rootRef.current?.measureInWindow((x, y) => {
      rootX.value = x;
      rootY.value = y;
    });
    const acc: Bound[] = [];
    let pending = STATUSES.length;
    STATUSES.forEach(s => {
      const ref = laneRefs.current[s];
      if (!ref) {
        pending -= 1;
        return;
      }
      ref.measureInWindow((_x, y, _w, h) => {
        acc.push({ status: s, top: y, bottom: y + h });
        pending -= 1;
        if (pending === 0) bounds.value = acc;
      });
    });
  }

  function endDrag(ticketId: string, from: TicketStatus, target: string | null) {
    setDragId(null);
    setDragging(false);
    hovered.value = null;
    if (!target || target === from || !STATUSES.includes(target as TicketStatus)) return;
    const to = target as TicketStatus;
    setPendingMoves(prev => ({ ...prev, [ticketId]: to }));
    move.mutate(
      { ticketId, status: to },
      {
        onError: () =>
          setPendingMoves(prev => {
            const next = { ...prev };
            delete next[ticketId];
            return next;
          }),
      },
    );
  }

  const makeGesture = (tk: Ticket, from: TicketStatus) =>
    Gesture.Pan()
      .enabled(canMoveTicket(tk))
      .activateAfterLongPress(220)
      .onStart(() => runOnJS(beginDrag)(tk.id))
      .onUpdate(e => {
        absX.value = e.absoluteX;
        absY.value = e.absoluteY;
        const b = bounds.value;
        let h: string | null = null;
        for (let i = 0; i < b.length; i++) {
          if (e.absoluteY >= b[i].top && e.absoluteY <= b[i].bottom) {
            h = b[i].status;
            break;
          }
        }
        hovered.value = h;
      })
      .onEnd(() => runOnJS(endDrag)(tk.id, from, hovered.value))
      .onFinalize(() => {
        hovered.value = null;
      });

  return (
    <View ref={rootRef} style={{ flex: 1, backgroundColor: t.colors.surface }}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: t.colors.border, backgroundColor: t.colors.surfaceRaised }}>
        <ProjectFilterBar members={project.members} currentUserId={userId} value={filters} onChange={setUserFilters} />
      </View>

      {/* Sprint header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[2.5], borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
        <Txt weight="semibold" style={{ flexShrink: 1 }} numberOfLines={1}>{sprint.name}</Txt>
        <SprintPill sprint={sprint} size="sm" />
        <View style={{ flex: 1 }} />
        {canCreate ? (
          <Pressable onPress={() => setCreateStatus('todo')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.colors.primary, borderRadius: t.radius.md, paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[1.5] }}>
            <Plus size={14} color={t.colors.primaryText} />
            <Txt size={t.fontSize.xs} weight="semibold" color={t.colors.primaryText}>Create</Txt>
          </Pressable>
        ) : null}
      </View>

      {/* Swimlanes — statuses stacked top-to-bottom, cards side-by-side per lane */}
      <View style={{ flex: 1, padding: t.spacing[2], gap: t.spacing[2] }}>
        {STATUSES.map(status => (
          <Lane
            key={status}
            status={status}
            cardWidth={CARD_W}
            tickets={columns[status]}
            laneRef={r => (laneRefs.current[status] = r)}
            hovered={hovered}
            dragId={dragId}
            dragging={dragging}
            canCreate={canCreate}
            createBlocked={createBlocked}
            onAdd={() => setCreateStatus(status)}
            onOpen={tk => nav.navigate('TicketDetail', { projectId, ticketKey: tk.key })}
            makeGesture={makeGesture}
          />
        ))}
      </View>

      {/* Floating drag card */}
      {dragId
        ? (() => {
            const card = STATUSES.flatMap(s => columns[s]).find(tk => tk.id === dragId);
            if (!card) return null;
            return <FloatingCard ticket={card} absX={absX} absY={absY} rootX={rootX} rootY={rootY} width={CARD_W} />;
          })()
        : null}

      {createStatus ? <CreateTicketModal project={project} initialStatus={createStatus} onClose={() => setCreateStatus(null)} /> : null}
    </View>
  );
}

// ── Lane (one status row) ─────────────────────────────────────────────────────────
function Lane({
  status,
  cardWidth,
  tickets,
  laneRef,
  hovered,
  dragId,
  dragging,
  canCreate,
  createBlocked,
  onAdd,
  onOpen,
  makeGesture,
}: {
  status: TicketStatus;
  cardWidth: number;
  tickets: Ticket[];
  laneRef: (r: View | null) => void;
  hovered: { value: string | null };
  dragId: string | null;
  dragging: boolean;
  canCreate: boolean;
  createBlocked: string;
  onAdd: () => void;
  onOpen: (tk: Ticket) => void;
  makeGesture: (tk: Ticket, from: TicketStatus) => any;
}) {
  const t = useTheme();
  const meta = STATUS_META[status];

  const dropStyle = useAnimatedStyle(() => ({
    borderColor: hovered.value === status ? t.colors.primary : t.colors.surfaceSunken,
    backgroundColor: hovered.value === status ? t.colors.primarySubtle : t.colors.surfaceSunken,
  }));

  return (
    <Animated.View ref={laneRef as any} style={[{ flex: 1, borderWidth: 1, borderRadius: t.radius.lg, overflow: 'hidden' }, dropStyle]}>
      {/* Lane header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingHorizontal: t.spacing[3], paddingTop: t.spacing[2], paddingBottom: t.spacing[1] }}>
        <StatusDot status={status} />
        <Txt weight="semibold" size={t.fontSize.xs} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.label}</Txt>
        <View style={{ minWidth: 20, height: 18, borderRadius: 9, backgroundColor: t.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder} weight="medium">{tickets.length}</Txt>
        </View>
        {canCreate ? (
          <Pressable onPress={onAdd} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Plus size={16} color={t.colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {/* Cards side-by-side, horizontal scroll */}
      <ScrollView
        horizontal
        scrollEnabled={!dragging}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: t.spacing[2], paddingBottom: t.spacing[2], gap: t.spacing[2], alignItems: 'stretch' }}
      >
        {tickets.length === 0 ? (
          <View style={{ width: cardWidth, alignItems: 'center', justifyContent: 'center', paddingVertical: t.spacing[4] }}>
            <Txt variant="placeholder" size={t.fontSize.xs}>{createBlocked && !canCreate ? createBlocked : 'No tickets'}</Txt>
          </View>
        ) : (
          tickets.map(tk => (
            <GestureDetector key={tk.id} gesture={makeGesture(tk, status)}>
              <View style={{ width: cardWidth, opacity: dragId === tk.id ? 0.3 : 1 }}>
                <BoardCardRow ticket={tk} onOpen={() => onOpen(tk)} />
              </View>
            </GestureDetector>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function BoardCardRow({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onOpen} style={{ flex: 1 }}>
      <Card style={{ flex: 1, gap: t.spacing[1.5], padding: t.spacing[2.5], justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[1.5] }}>
          <TypeIcon type={ticket.type} />
          <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textSubtle}>{ticket.key}</Txt>
          {ticket.parentKey ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: withAlpha(t.colors.textSubtle, 0.1), borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 }}>
              <CornerUpLeft size={8} color={t.colors.textSubtle} />
              <Txt size={t.fontSize.xxs} color={t.colors.textSubtle}>{ticket.parentKey}</Txt>
            </View>
          ) : null}
          {ticket.subTicketKeys.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: withAlpha(t.colors.primary, 0.1), borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 }}>
              <GitBranch size={8} color={t.colors.primary} />
              <Txt size={t.fontSize.xxs} color={t.colors.primary}>{ticket.subTicketKeys.length}</Txt>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <PriorityIcon priority={ticket.priority} size={13} />
        </View>
        <Txt size={t.fontSize.sm} numberOfLines={2}>{ticket.title}</Txt>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          {ticket.assignee ? (
            <Avatar name={ticket.assignee.name} id={ticket.assignee.id} size={20} />
          ) : (
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: t.colors.textPlaceholder }} />
          )}
        </View>
      </Card>
    </Pressable>
  );
}

// ── Floating drag card ──────────────────────────────────────────────────────────
function FloatingCard({ ticket, absX, absY, rootX, rootY, width }: { ticket: Ticket; absX: any; absY: any; rootX: any; rootY: any; width: number }) {
  const t = useTheme();
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: absX.value - rootX.value - width / 2 },
      { translateY: absY.value - rootY.value - 30 },
      { rotate: '2deg' },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width }, style]}>
      <View style={{ borderWidth: 1, borderColor: t.colors.primary, borderRadius: t.radius.lg, backgroundColor: t.colors.surfaceRaised, padding: t.spacing[2.5], gap: t.spacing[1.5], ...t.elevation.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[1.5] }}>
          <TypeIcon type={ticket.type} />
          <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textSubtle}>{ticket.key}</Txt>
          <View style={{ flex: 1 }} />
          <PriorityIcon priority={ticket.priority} size={13} />
        </View>
        <Txt size={t.fontSize.sm} numberOfLines={2}>{ticket.title}</Txt>
      </View>
    </Animated.View>
  );
}
