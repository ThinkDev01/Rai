import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import {
  Plus,
  Clock,
  Ticket as TicketIcon,
  Users,
  Zap,
  Layers,
  ClipboardList,
  ArrowUpRight,
  X,
} from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, KeySquare, withAlpha } from '@/components/ui/primitives';
import { TypeIcon, PriorityIcon, StatusChip } from '@/components/ui/chips';
import { ErrorState, SkeletonCard } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useProjects } from '@/api/projects';
import { useMyWork } from '@/api/misc';
import { useDomainPeers } from '@/api/orgs';
import { useDismissedDomainPeers } from '@/hooks/useDismissedDomainPeers';
import { useAuthStore, useCurrentMembership, useCurrentRole } from '@/store/authStore';
import { projectColor } from '@/lib/colors';
import { formatDate } from '@/lib/dates';
import { isManagerPlus, isAdminPlus } from '@/lib/permissions';
import { MESSAGES } from '@/lib/messages';
import { CreateProjectModal } from '@/components/modals/CreateProjectModal';
import type { Priority, TicketStatus, MyWorkItem } from '@/types/api.types';

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3, lowest: 4 };
const STATUS_RANK: Record<TicketStatus, number> = { in_progress: 0, in_review: 1, todo: 2, done: 3 };
const DASHBOARD_PROJECT_CAP = 6;

type Accent = 'primary' | 'success' | 'warning' | 'info';

export function DashboardScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const user = useAuthStore(s => s.user);
  const memberships = useAuthStore(s => s.memberships);
  const membership = useCurrentMembership();
  const role = useCurrentRole();
  const isPmOrAbove = isManagerPlus(role);
  const isAdminTier = isAdminPlus(role);

  const projectsQ = useProjects();
  const myWorkQ = useMyWork();
  const { data: peerOrgs = [] } = useDomainPeers(user?.email ?? null);
  const { dismissed, dismiss } = useDismissedDomainPeers(user?.id);
  const [showCreate, setShowCreate] = useState(false);

  const projects = projectsQ.data ?? [];
  const myWork = myWorkQ.data ?? [];

  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects]);
  const projectsWithActiveSprint = useMemo(() => activeProjects.filter(p => p.activeSprintName), [activeProjects]);
  const myOpenTickets = useMemo(() => myWork.filter(i => i.ticket.status !== 'done'), [myWork]);
  const myInProgress = useMemo(
    () => myWork.filter(i => i.ticket.status === 'in_progress' || i.ticket.status === 'in_review'),
    [myWork],
  );
  const inProg = myInProgress.filter(i => i.ticket.status === 'in_progress').length;
  const inRev = myInProgress.filter(i => i.ticket.status === 'in_review').length;

  const topMyTickets = useMemo(
    () =>
      [...myOpenTickets]
        .sort((a, b) => {
          const p = PRIORITY_RANK[a.ticket.priority] - PRIORITY_RANK[b.ticket.priority];
          if (p !== 0) return p;
          return STATUS_RANK[a.ticket.status] - STATUS_RANK[b.ticket.status];
        })
        .slice(0, 5),
    [myOpenTickets],
  );

  const visiblePeers = useMemo(() => {
    const myOrgIds = new Set(memberships.map(m => m.org_id));
    return peerOrgs.filter(p => !myOrgIds.has(p.id) && !dismissed.includes(p.id));
  }, [peerOrgs, memberships, dismissed]);

  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'there';
  const loading = projectsQ.isLoading;
  const myWorkLoading = myWorkQ.isLoading;

  const onRefresh = () => {
    projectsQ.refetch();
    myWorkQ.refetch();
  };

  const visibleProjects = activeProjects.slice(0, DASHBOARD_PROJECT_CAP);
  const overflow = activeProjects.length - visibleProjects.length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title={`Welcome back, ${displayName}`}
        subtitle={membership ? `Here's what's happening in ${membership.org_name}` : "Here's what's happening"}
        onMenu={() => nav.dispatch(DrawerActions.openDrawer())}
        onSearch={() => nav.navigate('Search')}
        showBell
      />
      <Screen scroll refreshing={projectsQ.isRefetching || myWorkQ.isRefetching} onRefresh={onRefresh}>
        {projectsQ.isError ? (
          <ErrorState message="Failed to load dashboard" onRetry={onRefresh} />
        ) : loading ? (
          <View style={{ gap: t.spacing[3] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[3] }}>
              {[1, 2, 3, 4].map(i => (
                <View key={i} style={{ flexGrow: 1, minWidth: '45%' }}>
                  <SkeletonCard />
                </View>
              ))}
            </View>
            <SkeletonCard />
          </View>
        ) : (
          <View style={{ gap: t.spacing[5] }}>
            {/* Domain-peer banner (admin/owner only, dismissable) */}
            {isAdminTier && visiblePeers.length > 0 ? (
              <View style={{ borderRadius: t.radius.lg, borderWidth: 1, borderColor: withAlpha(t.colors.warning, 0.4), backgroundColor: withAlpha(t.colors.warning, 0.1), padding: t.spacing[3], paddingRight: t.spacing[8] }}>
                <Pressable onPress={() => dismiss(visiblePeers.map(p => p.id))} hitSlop={8} style={{ position: 'absolute', right: 6, top: 6, padding: 4 }}>
                  <X size={14} color={t.colors.warning} />
                </Pressable>
                <Txt weight="semibold" color={t.colors.warning} size={t.fontSize.sm}>
                  Other organization{visiblePeers.length === 1 ? '' : 's'} in your email domain
                </Txt>
                <Txt size={t.fontSize.xs} style={{ marginTop: 2 }}>
                  {visiblePeers.map(p => p.name).join(', ')}
                </Txt>
                <Txt variant="placeholder" size={t.fontSize.xs} style={{ marginTop: 2 }}>
                  Heads up — someone in your domain has a separate workspace. You can always find this list under Settings.
                </Txt>
              </View>
            ) : null}

            {/* Stats */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[3] }}>
              <StatCard
                label="My open tickets"
                value={myWorkLoading ? '–' : myOpenTickets.length}
                icon={<ClipboardList size={14} color={t.colors.primary} />}
                accent="primary"
                sub={myWorkLoading ? 'Loading…' : myOpenTickets.length === 0 ? "You're caught up" : `Across ${new Set(myOpenTickets.map(i => i.project.id)).size} projects`}
                onPress={() => nav.navigate('MyWork')}
              />
              <StatCard
                label="In progress / review"
                value={myWorkLoading ? '–' : myInProgress.length}
                icon={<Layers size={14} color={t.colors.warning} />}
                accent="warning"
                sub={myWorkLoading ? 'Loading…' : `${inProg} in progress · ${inRev} in review`}
              />
              <StatCard
                label="Active sprints"
                value={projectsWithActiveSprint.length}
                icon={<Zap size={14} color={t.colors.success} />}
                accent="success"
                sub={`Across ${activeProjects.length} project${activeProjects.length === 1 ? '' : 's'}`}
              />
              <StatCard
                label="Projects"
                value={activeProjects.length}
                icon={<TicketIcon size={14} color={t.colors.info} />}
                accent="info"
                sub={projects.length - activeProjects.length > 0 ? `${projects.length - activeProjects.length} archived` : 'All active'}
              />
            </View>

            {/* My open tickets */}
            <View style={{ gap: t.spacing[2] }}>
              <SectionHeader icon={<ClipboardList size={14} color={t.colors.textSubtle} />} title="My open tickets" count={myOpenTickets.length} onViewAll={() => nav.navigate('MyWork')} />
              <Card padded={false}>
                {topMyTickets.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: t.spacing[8] }}>
                    <ClipboardList size={24} color={t.colors.border} />
                    <Txt weight="medium" style={{ marginTop: t.spacing[2] }}>{MESSAGES.myWork.noTickets.title}</Txt>
                    <Txt variant="subtle" size={t.fontSize.xs}>{MESSAGES.myWork.noTickets.description}</Txt>
                  </View>
                ) : (
                  topMyTickets.map((item, i) => <MyTicketRow key={item.ticket.id} item={item} first={i === 0} onPress={() => nav.navigate('TicketDetail', { projectId: item.ticket.projectId, ticketKey: item.ticket.key })} />)
                )}
              </Card>
            </View>

            {/* Active sprints */}
            <View style={{ gap: t.spacing[2] }}>
              <SectionHeader icon={<Zap size={14} color={t.colors.textSubtle} />} title="Active sprints" count={projectsWithActiveSprint.length} />
              <Card padded={false}>
                {projectsWithActiveSprint.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: t.spacing[8] }}>
                    <Zap size={24} color={t.colors.border} />
                    <Txt weight="medium" style={{ marginTop: t.spacing[2] }}>No active sprints</Txt>
                    <Txt variant="subtle" size={t.fontSize.xs}>Sprints will show here once teams start them.</Txt>
                  </View>
                ) : (
                  projectsWithActiveSprint.map((p, i) => (
                    <Pressable key={p.id} onPress={() => nav.navigate('Project', { projectId: p.id, screen: 'Board' })} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[3], borderTopWidth: i > 0 ? 1 : 0, borderTopColor: t.colors.border }}>
                      <KeySquare keyText={p.key} color={projectColor(p.key)} size={32} avatarType={p.avatarType} avatarValue={p.avatarValue} />
                      <View style={{ flex: 1 }}>
                        <Txt weight="medium" numberOfLines={1}>{p.name}</Txt>
                        <Txt variant="placeholder" size={t.fontSize.xs} numberOfLines={1}>
                          <Zap size={10} color={t.colors.success} /> {p.activeSprintName}
                        </Txt>
                      </View>
                      <ArrowUpRight size={13} color={t.colors.textPlaceholder} />
                    </Pressable>
                  ))
                )}
              </Card>
            </View>

            {/* Projects grid */}
            <View style={{ gap: t.spacing[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable onPress={() => nav.navigate('Projects')} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                  <TicketIcon size={14} color={t.colors.textSubtle} />
                  <Txt variant="heading">Projects</Txt>
                  <View style={{ backgroundColor: t.colors.surfaceSunken, borderRadius: t.radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder} weight="medium">{activeProjects.length}</Txt>
                  </View>
                </Pressable>
                {isPmOrAbove && activeProjects.length > 0 ? (
                  <Pressable onPress={() => setShowCreate(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.colors.primary, borderRadius: t.radius.md, paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[1.5] }}>
                    <Plus size={14} color={t.colors.primaryText} />
                    <Txt size={t.fontSize.xs} weight="semibold" color={t.colors.primaryText}>New project</Txt>
                  </Pressable>
                ) : null}
              </View>

              {activeProjects.length === 0 ? (
                <Card style={{ alignItems: 'center', paddingVertical: t.spacing[10], borderStyle: 'dashed' }}>
                  <View style={{ width: 56, height: 56, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: t.colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: t.spacing[3] }}>
                    <Plus size={26} color={t.colors.border} />
                  </View>
                  <Txt weight="semibold">{isPmOrAbove ? MESSAGES.dashboard.noProjects.title : MESSAGES.dashboard.noProjectsNonAdmin.title}</Txt>
                  <Txt variant="subtle" size={t.fontSize.xs} style={{ textAlign: 'center', marginTop: 4, maxWidth: 260 }}>
                    {isPmOrAbove ? MESSAGES.dashboard.noProjects.description : MESSAGES.dashboard.noProjectsNonAdmin.description}
                  </Txt>
                  {isPmOrAbove ? (
                    <Pressable onPress={() => setShowCreate(true)} style={{ marginTop: t.spacing[4], backgroundColor: t.colors.primary, borderRadius: t.radius.md, paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[2] }}>
                      <Txt size={t.fontSize.sm} weight="semibold" color={t.colors.primaryText}>{MESSAGES.dashboard.noProjects.cta}</Txt>
                    </Pressable>
                  ) : null}
                </Card>
              ) : (
                <View style={{ gap: t.spacing[3] }}>
                  {visibleProjects.map(p => (
                    <Pressable key={p.id} onPress={() => nav.navigate('Project', { projectId: p.id, screen: 'Board' })}>
                      <Card style={{ gap: t.spacing[3] }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2.5] }}>
                          <KeySquare keyText={p.key} color={projectColor(p.key)} size={32} avatarType={p.avatarType} avatarValue={p.avatarValue} />
                          <View style={{ flex: 1 }}>
                            <Txt weight="semibold" numberOfLines={1}>{p.name}</Txt>
                            <Txt variant="placeholder" size={t.fontSize.xxs}>{p.key}</Txt>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: t.spacing[1.5] }}>
                          <MiniStat icon={<TicketIcon size={11} color={t.colors.textPlaceholder} />} label="Tickets" value={p.ticketCount} />
                          <MiniStat icon={<Users size={11} color={t.colors.textPlaceholder} />} label="Members" value={p.memberCount} />
                          <MiniStat icon={<Zap size={11} color={t.colors.textPlaceholder} />} label="Sprint" value={p.activeSprintName ?? '–'} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border }}>
                          <Clock size={10} color={t.colors.textPlaceholder} />
                          <Txt variant="placeholder" size={t.fontSize.xxs}>Active {formatDate(p.lastActive)}</Txt>
                        </View>
                      </Card>
                    </Pressable>
                  ))}
                  {isPmOrAbove && overflow === 0 ? (
                    <Pressable onPress={() => setShowCreate(true)} style={{ alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: t.colors.border, borderRadius: t.radius.lg, paddingVertical: t.spacing[6], gap: 4 }}>
                      <Plus size={20} color={t.colors.border} />
                      <Txt variant="placeholder" size={t.fontSize.xs}>New project</Txt>
                    </Pressable>
                  ) : null}
                  {overflow > 0 ? (
                    <Pressable onPress={() => nav.navigate('Projects')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: t.colors.border, borderRadius: t.radius.lg, paddingVertical: 14 }}>
                      <Txt weight="medium" variant="subtle">Show all {activeProjects.length} projects</Txt>
                      <Txt variant="placeholder" size={t.fontSize.xs}>({overflow} more)</Txt>
                      <ArrowUpRight size={14} color={t.colors.textPlaceholder} />
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
          </View>
        )}
      </Screen>
      {showCreate ? <CreateProjectModal onClose={() => setShowCreate(false)} /> : null}
    </View>
  );
}

function StatCard({ label, value, icon, sub, accent, onPress }: { label: string; value: string | number; icon: React.ReactNode; sub: string; accent: Accent; onPress?: () => void }) {
  const t = useTheme();
  const accentColor = { primary: t.colors.primary, success: t.colors.success, warning: t.colors.warning, info: t.colors.info }[accent];
  const inner = (
    <Card style={{ flexGrow: 1, minWidth: '45%', gap: t.spacing[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }} numberOfLines={1}>
          {label}
        </Txt>
        <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: withAlpha(accentColor, 0.1), alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      </View>
      <Txt size={t.fontSize['2xl']} weight="bold">{value}</Txt>
      <Txt variant="placeholder" size={t.fontSize.xxs} numberOfLines={1}>{sub}</Txt>
    </Card>
  );
  return onPress ? <Pressable onPress={onPress} style={{ flexGrow: 1, minWidth: '45%' }}>{inner}</Pressable> : <View style={{ flexGrow: 1, minWidth: '45%' }}>{inner}</View>;
}

function SectionHeader({ icon, title, count, onViewAll }: { icon: React.ReactNode; title: string; count: number; onViewAll?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
        {icon}
        <Txt variant="heading">{title}</Txt>
        {count > 0 ? (
          <View style={{ backgroundColor: t.colors.surfaceSunken, borderRadius: t.radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder} weight="medium">{count}</Txt>
          </View>
        ) : null}
      </View>
      {onViewAll ? (
        <Pressable onPress={onViewAll} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Txt variant="link" size={t.fontSize.xs}>View all</Txt>
          <ArrowUpRight size={12} color={t.colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: t.colors.surface, borderRadius: t.radius.sm, paddingVertical: t.spacing[1.5] }}>
      {icon}
      <Txt weight="semibold" size={t.fontSize.xs} numberOfLines={1} style={{ marginTop: 2 }}>{value}</Txt>
      <Txt size={9} color={t.colors.textPlaceholder}>{label}</Txt>
    </View>
  );
}

function MyTicketRow({ item, first, onPress }: { item: MyWorkItem; first: boolean; onPress: () => void }) {
  const t = useTheme();
  const { ticket, project } = item;
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[2.5], borderTopWidth: first ? 0 : 1, borderTopColor: t.colors.border }}>
      <PriorityIcon priority={ticket.priority} size={13} />
      <TypeIcon type={ticket.type} size={12} />
      <Txt size={t.fontSize.xs} color={t.colors.textPlaceholder} style={{ width: 56 }} numberOfLines={1}>{ticket.key}</Txt>
      <Txt style={{ flex: 1 }} numberOfLines={1}>{ticket.title}</Txt>
      <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: projectColor(project.key), alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={8} weight="bold" color="#fff">{project.key[0]}</Txt>
      </View>
      <StatusChip status={ticket.status} size="sm" />
    </Pressable>
  );
}
