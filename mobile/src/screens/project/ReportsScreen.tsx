import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { BarChart2 } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Card, Txt } from '@/components/ui/primitives';
import { Picker } from '@/components/ui/Picker';
import { SprintPill } from '@/components/ui/chips';
import { Loading, ErrorState, EmptyState } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { useBurndown, useSprintReport, useVelocity } from '@/api/misc';
import { formatDate } from '@/lib/dates';
import { sortSprints } from '@/lib/sprintUtils';
import type { Sprint, Ticket, VelocityPoint } from '@/types/api.types';

export function ReportsScreen({ projectId }: { projectId: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { data: project, isLoading, isError, refetch } = useProject(projectId);

  const [sprintId, setSprintId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const sprints = project?.sprints;
    if (!sprints?.length) return;
    // Keep a valid user/initial selection; (re)select a default only when the
    // current selection is empty or no longer exists (e.g. sprints arrived
    // after first render, or the selected sprint was deleted).
    if (sprintId && sprints.some(s => s.id === sprintId)) return;
    const def = sprints.find(s => s.status === 'active') ?? sprints[0];
    if (def) setSprintId(def.id);
  }, [project?.sprints, sprintId]);

  const burndown = useBurndown(projectId, sprintId ?? '');
  const report = useSprintReport(projectId, sprintId ?? '');
  const velocity = useVelocity(projectId);

  if (isLoading) return <Loading label="Loading reports…" />;
  if (isError || !project) return <ErrorState message="Failed to load reports" onRetry={refetch} />;

  const sprints = sortSprints(project.sprints);
  const selected = sprints.find(s => s.id === sprintId);

  if (sprints.length === 0 || !selected) {
    return (
      <Screen>
        <EmptyState
          icon={<BarChart2 size={26} color={t.colors.textPlaceholder} />}
          title="No sprints yet"
          description="Reports populate once you create your first sprint and start tracking work."
        />
      </Screen>
    );
  }

  const tickets = selected.tickets;
  const removedCount = report.data?.removed.length ?? 0;
  const chartWidth = width - t.spacing[4] * 2 - t.spacing[4] * 2;

  // react-native-gifted-charts can crash natively if any data point's `value` is
  // NaN/undefined/Infinity. The report endpoints could return partial points, so
  // keep only points whose numbers are finite before they reach the chart.
  const burndownPoints = (burndown.data?.points ?? []).filter(
    p => Number.isFinite(p.remaining) && Number.isFinite(p.ideal),
  );
  const velocityData = (velocity.data ?? []).filter(
    d => Number.isFinite(d.committed) && Number.isFinite(d.completed),
  );

  return (
    <Screen scroll>
      <View style={{ gap: t.spacing[4] }}>
        {/* Header + sprint selector */}
        <View style={{ gap: t.spacing[2] }}>
          <Txt variant="title">Reports</Txt>
          <Txt variant="subtle" size={t.fontSize.xs}>
            Sprint analytics & insights
          </Txt>
          <Picker
            value={selected.id}
            options={sprints.map(s => ({ value: s.id, label: s.name, trailing: <SprintPill sprint={s} size="sm" /> }))}
            onChange={setSprintId}
            title="Sprint"
          />
        </View>

        {/* Sprint health banner */}
        <SprintHealthBanner sprint={selected} removedCount={removedCount} />

        {/* Burndown */}
        <Card style={{ gap: t.spacing[2] }}>
          <CardTitle title={`Burndown — ${selected.name}`} sub={`${formatDate(selected.startDate)} → ${formatDate(selected.endDate)}`} />
          {burndownPoints.length > 0 ? (
            <LineChart
              data={burndownPoints.map(p => ({ value: p.remaining }))}
              data2={burndownPoints.map(p => ({ value: p.ideal }))}
              width={chartWidth}
              height={170}
              color1={t.colors.primary}
              color2={t.colors.textDisabled}
              thickness={2.5}
              thickness2={1.5}
              hideDataPoints2
              dataPointsColor1={t.colors.primary}
              yAxisColor={t.colors.border}
              xAxisColor={t.colors.border}
              yAxisTextStyle={{ color: t.colors.textPlaceholder, fontSize: 10 }}
              rulesColor={t.colors.borderSubtle}
              rulesType="dashed"
            />
          ) : (
            <NoData label="No burndown data yet — status changes will appear here" />
          )}
          <View style={{ flexDirection: 'row', gap: t.spacing[4], marginTop: 4 }}>
            <Legend color={t.colors.textDisabled} label="Ideal" dashed />
            <Legend color={t.colors.primary} label="Actual" />
          </View>
        </Card>

        {/* Ticket types donut */}
        <DonutCard
          title="Ticket types"
          slices={[
            { label: 'Task', value: tickets.filter(tk => tk.type === 'task').length, color: t.colors.task },
            { label: 'Story', value: tickets.filter(tk => tk.type === 'story').length, color: t.colors.story },
            { label: 'Bug', value: tickets.filter(tk => tk.type === 'bug').length, color: t.colors.bug },
            { label: 'Epic', value: tickets.filter(tk => tk.type === 'epic').length, color: t.colors.epic },
          ]}
        />

        {/* Velocity */}
        <Card style={{ gap: t.spacing[2] }}>
          <CardTitle title="Velocity — all sprints" sub="Committed vs completed tickets per sprint" />
          {velocityData.length > 0 ? (
            <>
              <VelocityBars data={velocityData} />
              {velocityData.length >= 2 ? <VelocityAverages data={velocityData} /> : null}
            </>
          ) : (
            <NoData label="No sprint data available" />
          )}
        </Card>

        {/* Status donut */}
        <DonutCard
          title="Status breakdown"
          slices={[
            { label: 'Done', value: tickets.filter(tk => tk.status === 'done').length, color: t.colors.success },
            { label: 'In Review', value: tickets.filter(tk => tk.status === 'in_review').length, color: t.colors.story },
            { label: 'In Progress', value: tickets.filter(tk => tk.status === 'in_progress').length, color: t.colors.warning },
            { label: 'To Do', value: tickets.filter(tk => tk.status === 'todo').length, color: t.colors.textPlaceholder },
          ]}
        />

        {/* Workload */}
        <Card style={{ gap: t.spacing[2] }}>
          <CardTitle title="Workload by assignee" sub="Tickets assigned per team member" />
          <WorkloadChart tickets={tickets} />
        </Card>

        {/* Priority */}
        <Card style={{ gap: t.spacing[2] }}>
          <CardTitle title="Priority breakdown" sub="Distribution across priority levels" />
          <PriorityChart tickets={tickets} />
        </Card>
      </View>
    </Screen>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function CardTitle({ title, sub }: { title: string; sub?: string }) {
  const t = useTheme();
  return (
    <View>
      <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </Txt>
      {sub ? <Txt variant="placeholder" size={t.fontSize.xxs} style={{ marginTop: 2 }}>{sub}</Txt> : null}
    </View>
  );
}

function NoData({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
      <Txt variant="placeholder" size={t.fontSize.xs} style={{ textAlign: 'center' }}>
        {label}
      </Txt>
    </View>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: dashed ? 0 : 4, borderRadius: 2, backgroundColor: color, borderTopWidth: dashed ? 1.5 : 0, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Txt variant="subtle" size={t.fontSize.xs}>
        {label}
      </Txt>
    </View>
  );
}

function SprintHealthBanner({ sprint, removedCount }: { sprint: Sprint; removedCount: number }) {
  const t = useTheme();
  const tickets = sprint.tickets;
  const total = tickets.length;
  const done = tickets.filter(tk => tk.status === 'done').length;
  const inProgress = tickets.filter(tk => tk.status === 'in_progress').length;
  const inReview = tickets.filter(tk => tk.status === 'in_review').length;
  const todo = tickets.filter(tk => tk.status === 'todo').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const segments = [
    { v: done, color: t.colors.success },
    { v: inReview, color: t.colors.story },
    { v: inProgress, color: t.colors.warning },
    { v: todo, color: t.colors.border },
  ];

  const counts = [
    { n: done, label: 'Done', color: t.colors.success },
    { n: inReview, label: 'Review', color: t.colors.story },
    { n: inProgress, label: 'Active', color: t.colors.warning },
    { n: todo, label: 'To Do', color: t.colors.textPlaceholder },
    ...(removedCount > 0 ? [{ n: removedCount, label: 'Removed', color: t.colors.danger }] : []),
  ];

  return (
    <Card style={{ gap: t.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[4] }}>
        <PieChart
          donut
          radius={32}
          innerRadius={24}
          data={[
            ...(pct > 0 ? [{ value: pct, color: t.colors.success }] : []),
            ...(pct < 100 ? [{ value: 100 - pct, color: t.colors.surfaceSunken }] : []),
          ]}
          centerLabelComponent={() => (
            <Txt weight="bold" size={t.fontSize.base}>
              {pct}%
            </Txt>
          )}
        />
        <View style={{ flex: 1 }}>
          <Txt weight="semibold">
            {done} of {total} completed
          </Txt>
          <Txt variant="placeholder" size={t.fontSize.xs}>
            {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
          </Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[4] }}>
        {counts.map(c => (
          <View key={c.label} style={{ alignItems: 'center' }}>
            <Txt weight="bold" size={t.fontSize.lg} color={c.color}>
              {c.n}
            </Txt>
            <Txt variant="placeholder" size={t.fontSize.xxs}>
              {c.label}
            </Txt>
          </View>
        ))}
      </View>

      {/* Stacked progress bar */}
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: t.colors.surface }}>
        {segments.map((s, i) => (s.v > 0 ? <View key={i} style={{ flex: s.v, backgroundColor: s.color }} /> : null))}
      </View>
    </Card>
  );
}

function DonutCard({ title, slices }: { title: string; slices: { label: string; value: number; color: string }[] }) {
  const t = useTheme();
  const data = slices.filter(s => s.value > 0);
  const total = data.reduce((s, x) => s + x.value, 0);
  return (
    <Card style={{ gap: t.spacing[3] }}>
      <CardTitle title={title} />
      {total === 0 ? (
        <NoData label="No data" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[5] }}>
          <PieChart
            donut
            radius={56}
            innerRadius={38}
            data={data.map(s => ({ value: s.value, color: s.color }))}
            centerLabelComponent={() => (
              <View style={{ alignItems: 'center' }}>
                <Txt weight="bold" size={t.fontSize.lg}>
                  {total}
                </Txt>
                <Txt variant="placeholder" size={9}>
                  total
                </Txt>
              </View>
            )}
          />
          <View style={{ flex: 1, gap: t.spacing[2] }}>
            {data.map(s => (
              <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
                <Txt variant="subtle" size={t.fontSize.xs} style={{ flex: 1 }}>
                  {s.label}
                </Txt>
                <Txt weight="semibold" size={t.fontSize.xs}>
                  {s.value}
                </Txt>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

function VelocityBars({ data }: { data: VelocityPoint[] }) {
  const t = useTheme();
  const maxVal = Math.max(...data.map(d => Math.max(d.committed, d.completed)), 1);
  const H = 130;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: t.spacing[4], alignItems: 'flex-end', height: H, paddingTop: t.spacing[4] }}>
        {data.map((d, i) => {
          const statusLabel = d.status === 'completed' ? 'Done' : d.status === 'active' ? 'Active' : 'Planned';
          const statusColor = d.status === 'completed' ? t.colors.success : d.status === 'active' ? t.colors.primary : t.colors.textPlaceholder;
          return (
            <View key={i} style={{ alignItems: 'center', width: 56 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: H - 30 }}>
                <Bar height={(d.committed / maxVal) * (H - 30)} color={t.colors.textDisabled} value={d.committed} />
                <Bar height={(d.completed / maxVal) * (H - 30)} color={t.colors.primary} value={d.completed} />
              </View>
              <Txt size={9} variant="subtle" numberOfLines={1} style={{ marginTop: 4 }}>
                {d.sprintName.length > 8 ? d.sprintName.slice(0, 7) + '…' : d.sprintName}
              </Txt>
              <Txt size={8} color={statusColor}>
                {statusLabel}
              </Txt>
            </View>
          );
        })}
        <View style={{ marginLeft: t.spacing[2], justifyContent: 'flex-start', gap: 4 }}>
          <Legend color={t.colors.textDisabled} label="Committed" />
          <Legend color={t.colors.primary} label="Completed" />
        </View>
      </View>
    </ScrollView>
  );
}

function Bar({ height, color, value }: { height: number; color: string; value: number }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
      {value > 0 ? <Txt size={8} weight="semibold" color={color}>{value}</Txt> : null}
      <View style={{ width: 18, height: Math.max(height, value > 0 ? 4 : 0), backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
    </View>
  );
}

function VelocityAverages({ data }: { data: VelocityPoint[] }) {
  const t = useTheme();
  const avgCommitted = Math.round(data.reduce((s, d) => s + d.committed, 0) / data.length);
  const avgCompleted = Math.round(data.reduce((s, d) => s + d.completed, 0) / data.length);
  const rate = avgCommitted > 0 ? Math.round((avgCompleted / avgCommitted) * 100) : 0;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[4], borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[3], marginTop: t.spacing[2] }}>
      <Txt variant="subtle" size={t.fontSize.xs}>
        Avg committed: <Txt weight="bold">{avgCommitted}</Txt>
      </Txt>
      <Txt variant="subtle" size={t.fontSize.xs}>
        Avg completed: <Txt weight="bold">{avgCompleted}</Txt>
      </Txt>
      <Txt variant="subtle" size={t.fontSize.xs}>
        Completion: <Txt weight="bold">{rate}%</Txt>
      </Txt>
    </View>
  );
}

function WorkloadChart({ tickets }: { tickets: Ticket[] }) {
  const t = useTheme();
  const map = new Map<string, { name: string; done: number; notDone: number }>();
  for (const tk of tickets) {
    const name = tk.assignee?.name ?? 'Unassigned';
    const key = tk.assignee?.id ?? '_unassigned';
    if (!map.has(key)) map.set(key, { name, done: 0, notDone: 0 });
    const e = map.get(key)!;
    if (tk.status === 'done') e.done++;
    else e.notDone++;
  }
  const data = [...map.values()].sort((a, b) => b.done + b.notDone - (a.done + a.notDone));
  const maxCount = Math.max(...data.map(d => d.done + d.notDone), 1);

  if (data.length === 0) return <Txt variant="placeholder" size={t.fontSize.xs}>No tickets</Txt>;

  return (
    <View style={{ gap: t.spacing[3] }}>
      {data.map(d => {
        const total = d.done + d.notDone;
        return (
          <View key={d.name}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Txt variant="subtle" size={t.fontSize.xs} numberOfLines={1} style={{ flex: 1 }}>
                {d.name}
              </Txt>
              <Txt size={t.fontSize.xs} weight="semibold">
                {total} <Txt variant="placeholder" size={t.fontSize.xxs}>({d.done} done)</Txt>
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: t.colors.surface }}>
              {d.done > 0 ? <View style={{ flex: d.done, backgroundColor: t.colors.success }} /> : null}
              {d.notDone > 0 ? <View style={{ flex: d.notDone, backgroundColor: t.colors.warning }} /> : null}
              {total < maxCount ? <View style={{ flex: maxCount - total }} /> : null}
            </View>
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', gap: t.spacing[4] }}>
        <Legend color={t.colors.success} label="Done" />
        <Legend color={t.colors.warning} label="In progress" />
      </View>
    </View>
  );
}

function PriorityChart({ tickets }: { tickets: Ticket[] }) {
  const t = useTheme();
  const defs = [
    { label: 'Critical', key: 'critical', color: t.colors.priorityCritical },
    { label: 'High', key: 'high', color: t.colors.priorityHigh },
    { label: 'Medium', key: 'medium', color: t.colors.priorityMedium },
    { label: 'Low', key: 'low', color: t.colors.priorityLow },
    { label: 'Lowest', key: 'lowest', color: t.colors.priorityLowest },
  ];
  const data = defs.map(p => ({ ...p, count: tickets.filter(tk => tk.priority === p.key).length })).filter(p => p.count > 0);
  if (data.length === 0) return <Txt variant="placeholder" size={t.fontSize.xs}>No tickets</Txt>;

  return (
    <View style={{ gap: t.spacing[3] }}>
      <View style={{ flexDirection: 'row', height: 30, borderRadius: 8, overflow: 'hidden', backgroundColor: t.colors.surface }}>
        {data.map(p => (
          <View key={p.key} style={{ flex: p.count, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={10} weight="bold" color="#fff">
              {p.count}
            </Txt>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[3] }}>
        {data.map(p => (
          <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: p.color }} />
            <Txt variant="subtle" size={t.fontSize.xs}>
              {p.label}
            </Txt>
            <Txt weight="semibold" size={t.fontSize.xs}>
              {p.count}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}
