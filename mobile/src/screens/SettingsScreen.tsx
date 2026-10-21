import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  User,
  Lock,
  Palette,
  Building2,
  ArrowRightLeft,
  Plus,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  AlertTriangle,
  Sun,
  Moon,
  Download,
  Bell,
  ClipboardList,
  FolderOpen,
  Users,
  Layers,
  CreditCard,
  ChevronRight,
  Calendar,
  MessageSquare,
} from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, Button, Divider, withAlpha } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/Input';
import { RoleChip, SubscriptionChip } from '@/components/ui/chips';
import { Loading } from '@/components/ui/states';
import { useTheme, type ThemePref } from '@/theme/ThemeProvider';
import { useAuthStore, useCurrentMembership, useCurrentRole } from '@/store/authStore';
import {
  usePatchProfileName,
  useChangePassword,
  useUpdateOrgName,
  useToggleOrgDiscoverable,
  useExportOrg,
  useSwitchOrg,
  useDomainPeers,
} from '@/api/orgs';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type PreferenceItem,
} from '@/api/notifications';
import { useDismissedDomainPeers } from '@/hooks/useDismissedDomainPeers';
import { useBillingSummary } from '@/api/billing';
import { isFederatedUser, federatedProvider, forgotPassword, confirmForgotPassword } from '@/lib/cognito';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { extractApiError } from '@/lib/errors';
import { TransferOwnershipModal } from '@/components/modals/TransferOwnershipModal';
import { DeleteOrgModal } from '@/components/modals/DeleteOrgModal';
import { LeaveOrgModal } from '@/components/modals/LeaveOrgModal';
import { FeedbackModal } from '@/components/modals/FeedbackModal';

const NAME_MAX = 20;

function SectionCard({
  icon,
  title,
  description,
  children,
  danger,
  warning,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
  warning?: boolean;
}) {
  const t = useTheme();
  const accent = danger ? t.colors.danger : warning ? t.colors.warning : undefined;
  return (
    <Card padded={false} style={accent ? { borderColor: withAlpha(accent, 0.3) } : undefined}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing[2],
          padding: t.spacing[4],
          borderBottomWidth: 1,
          borderBottomColor: accent ? withAlpha(accent, 0.2) : t.colors.border,
          backgroundColor: accent ? withAlpha(accent, 0.05) : undefined,
        }}
      >
        {icon}
        <View style={{ flex: 1 }}>
          <Txt weight="semibold" color={accent}>
            {title}
          </Txt>
          {description ? (
            <Txt variant="subtle" size={t.fontSize.xs}>
              {description}
            </Txt>
          ) : null}
        </View>
      </View>
      <View style={{ padding: t.spacing[4], gap: t.spacing[3] }}>{children}</View>
    </Card>
  );
}

function Row({ label, value, right }: { label: string; value?: string; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[3] }}>
      <Txt variant="subtle" size={t.fontSize.xs}>
        {label}
      </Txt>
      {right ?? (
        <Txt size={t.fontSize.sm} weight="medium" style={{ flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>
          {value}
        </Txt>
      )}
    </View>
  );
}

export function SettingsScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const user = useAuthStore(s => s.user);
  const memberships = useAuthStore(s => s.memberships);
  const currentOrgId = useAuthStore(s => s.currentOrgId);
  const membership = useCurrentMembership();
  const role = useCurrentRole();
  const isOwner = role === 'owner';
  const isAdmin = role === 'owner' || role === 'admin';

  const patchName = usePatchProfileName();
  const updateOrgName = useUpdateOrgName(currentOrgId ?? '');
  const toggleDisc = useToggleOrgDiscoverable();
  const exportOrg = useExportOrg(currentOrgId ?? '');
  const switchOrg = useSwitchOrg();

  // Federation detection (async) resolved once on mount.
  const [federated, setFederated] = useState<{ is: boolean; provider: string | null }>({ is: false, provider: null });
  useEffect(() => {
    (async () => {
      const is = await isFederatedUser();
      const provider = is ? await federatedProvider() : null;
      setFederated({ is, provider });
    })();
  }, []);

  const [editName, setEditName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editOrgName, setEditOrgName] = useState(false);
  const [orgNameDraft, setOrgNameDraft] = useState('');

  const [showTransfer, setShowTransfer] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const otherOrgs = useMemo(() => memberships.filter(m => m.org_id !== currentOrgId), [memberships, currentOrgId]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Settings" subtitle="Account and organization preferences" onBack={() => nav.goBack()} showThemeToggle={false} />
      <Screen scroll>
        <View style={{ gap: t.spacing[4] }}>
          {/* ── Trial banner (owner only) ── */}
          {isOwner && <TrialBanner onSubscribe={() => nav.navigate('SubscriptionPlans')} />}

          {/* ── Account ── */}
          <SectionCard icon={<User size={18} color={t.colors.textSubtle} />} title="Account" description="Your personal profile information.">
            <Row label="Email" value={user?.email} />
            <Divider />
            <Row label="Email verified" value={user?.emailVerified ? 'Yes' : 'No'} />
            <Divider />
            {editName ? (
              <View style={{ gap: t.spacing[2] }}>
                <TextField label="Display name" value={nameDraft} onChangeText={setNameDraft} maxLength={NAME_MAX} placeholder="Your name" autoFocus hint={`${nameDraft.length}/${NAME_MAX}`} />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing[2] }}>
                  <Button title="Cancel" size="sm" variant="secondary" disabled={patchName.isPending} onPress={() => setEditName(false)} />
                  <Button
                    title="Save"
                    size="sm"
                    loading={patchName.isPending}
                    disabled={nameDraft.trim().length < 2 || nameDraft.trim() === (user?.name ?? '')}
                    onPress={() => patchName.mutate(nameDraft.trim(), { onSuccess: () => setEditName(false) })}
                  />
                </View>
              </View>
            ) : (
              <Row
                label="Display name"
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                    <Txt size={t.fontSize.sm} weight="medium" color={user?.name ? undefined : t.colors.textPlaceholder} style={user?.name ? undefined : { fontStyle: 'italic' }}>
                      {user?.name || '(Not set)'}
                    </Txt>
                    <Button title="Edit" size="sm" variant="secondary" onPress={() => { setNameDraft(user?.name ?? ''); setEditName(true); }} />
                  </View>
                }
              />
            )}
          </SectionCard>

          {/* ── Password ── */}
          <SectionCard
            icon={<Lock size={18} color={t.colors.textSubtle} />}
            title="Password"
            description={federated.is ? `Managed by your sign-in provider (${federated.provider ?? 'external'}).` : 'Change your password or reset it via email.'}
          >
            {federated.is ? (
              <Txt variant="subtle" size={t.fontSize.xs}>
                You signed in with {federated.provider ?? 'an external provider'}. Manage your password with them.
              </Txt>
            ) : (
              <PasswordSection email={user?.email ?? ''} />
            )}
          </SectionCard>

          {/* ── Appearance ── */}
          <SectionCard icon={<Palette size={18} color={t.colors.textSubtle} />} title="Appearance" description="Light or dark theme. Persists on this device.">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="subtle" size={t.fontSize.xs}>
                Theme
              </Txt>
              <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                {([
                  { v: 'light', label: 'Light', icon: Sun },
                  { v: 'dark', label: 'Dark', icon: Moon },
                  { v: 'system', label: 'System', icon: Palette },
                ] as { v: ThemePref; label: string; icon: any }[]).map(o => {
                  const Icon = o.icon;
                  const active = t.pref === o.v;
                  return (
                    <Pressable
                      key={o.v}
                      onPress={() => t.setPref(o.v)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[1.5], borderRadius: t.radius.md, backgroundColor: active ? t.colors.primary : t.colors.surfaceSunken }}
                    >
                      <Icon size={13} color={active ? t.colors.primaryText : t.colors.textSubtle} />
                      <Txt size={t.fontSize.xs} weight="medium" color={active ? t.colors.primaryText : t.colors.textSubtle}>
                        {o.label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </SectionCard>

          {/* ── Current organization ── */}
          {membership ? (
            <SectionCard icon={<Building2 size={18} color={t.colors.textSubtle} />} title="Current organization" description="The org you're currently working in.">
              {editOrgName ? (
                <View style={{ gap: t.spacing[2] }}>
                  <TextField label="Organization name" value={orgNameDraft} onChangeText={setOrgNameDraft} maxLength={100} autoFocus hint="The @identifier stays the same — invite links and URLs are unaffected." />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing[2] }}>
                    <Button title="Cancel" size="sm" variant="secondary" disabled={updateOrgName.isPending} onPress={() => setEditOrgName(false)} />
                    <Button
                      title="Save"
                      size="sm"
                      loading={updateOrgName.isPending}
                      disabled={orgNameDraft.trim().length < 2 || orgNameDraft.trim() === membership.org_name}
                      onPress={() => updateOrgName.mutate(orgNameDraft.trim(), { onSuccess: () => setEditOrgName(false) })}
                    />
                  </View>
                </View>
              ) : (
                <Row
                  label="Name"
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                      <Txt size={t.fontSize.sm} weight="medium" numberOfLines={1}>
                        {membership.org_name}
                      </Txt>
                      {isAdmin ? <Button title="Edit" size="sm" variant="secondary" onPress={() => { setOrgNameDraft(membership.org_name); setEditOrgName(true); }} /> : null}
                    </View>
                  }
                />
              )}
              <Divider />
              <Row label="Identifier" value={`@${membership.org_slug}`} />
              <Divider />
              <Row label="Your role" right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}><Txt size={t.fontSize.sm} weight="medium">{membership.role_label ?? membership.role}</Txt><RoleChip role={membership.role} size="sm" /></View>} />
              <Divider />
              <Row label="Subscription" right={<SubscriptionChip status={membership.subscription_status} size="sm" />} />
              {isOwner ? (
                <>
                  <Divider />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[2] }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="subtle" size={t.fontSize.xs}>
                        Discoverability
                      </Txt>
                      <Txt variant="placeholder" size={t.fontSize.xxs}>
                        {membership.discoverable
                          ? `Others in your email domain can see ${membership.org_name}.`
                          : `${membership.org_name} is hidden from your email domain.`}
                      </Txt>
                    </View>
                    <Button
                      title={membership.discoverable ? 'Visible' : 'Hidden'}
                      size="sm"
                      variant="secondary"
                      loading={toggleDisc.isPending}
                      leftIcon={membership.discoverable ? <Eye size={12} color={t.colors.primary} /> : <EyeOff size={12} color={t.colors.warning} />}
                      onPress={() => toggleDisc.mutate({ orgId: membership.org_id, discoverable: !membership.discoverable })}
                    />
                  </View>
                </>
              ) : null}
            </SectionCard>
          ) : null}

          {/* ── Billing (owner only) ── */}
          {isOwner && membership ? (
            <SectionCard
              icon={<CreditCard size={18} color={t.colors.textSubtle} />}
              title="Billing"
              description="Manage your organization's subscription plan."
            >
              <Pressable
                onPress={() => nav.navigate('SubscriptionPlans')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: t.spacing[3],
                }}
              >
                <View style={{ flex: 1 }}>
                  <Txt weight="medium" size={t.fontSize.sm}>
                    Subscription Plans
                  </Txt>
                  <Txt variant="subtle" size={t.fontSize.xs}>
                    View available plans and manage your subscription.
                  </Txt>
                </View>
                <ChevronRight size={16} color={t.colors.textPlaceholder} />
              </Pressable>
            </SectionCard>
          ) : null}

          {/* ── Switch organization ── */}
          {otherOrgs.length > 0 ? (
            <SectionCard icon={<ArrowRightLeft size={18} color={t.colors.textSubtle} />} title="Switch organization" description={`You belong to ${memberships.length} organizations.`}>
              {otherOrgs.map((m, i) => (
                <View key={m.org_id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[2], paddingVertical: i > 0 ? t.spacing[2] : 0 }}>
                    <View style={{ flex: 1 }}>
                      <Txt size={t.fontSize.sm} weight="medium" numberOfLines={1}>
                        {m.org_name}
                      </Txt>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Txt variant="placeholder" size={t.fontSize.xxs}>@{m.org_slug}</Txt>
                        <RoleChip role={m.role} size="sm" />
                        <SubscriptionChip status={m.subscription_status} size="sm" />
                      </View>
                    </View>
                    <Button title="Switch" size="sm" variant="secondary" onPress={() => switchOrg(m)} />
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}

          {/* ── Add another organization ── */}
          <SectionCard icon={<Plus size={18} color={t.colors.textSubtle} />} title="Add another organization" description="Create a separate org you'll own.">
            <Button title="+ Create new organization" variant="secondary" onPress={() => nav.navigate('CreateOrg')} />
          </SectionCard>

          {/* ── Export data ── */}
          {isAdmin && membership ? (
            <SectionCard icon={<Download size={18} color={t.colors.textSubtle} />} title="Export your data" description="Download all org data — members, projects, sprints, tickets, and comments.">
              <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                <Button
                  title="Export JSON"
                  size="sm"
                  variant="secondary"
                  loading={exportOrg.isPending && exportOrg.variables === 'json'}
                  disabled={exportOrg.isPending}
                  leftIcon={<Download size={13} color={t.colors.primary} />}
                  onPress={() => exportOrg.mutate('json')}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Export Excel"
                  size="sm"
                  variant="secondary"
                  loading={exportOrg.isPending && exportOrg.variables === 'xlsx'}
                  disabled={exportOrg.isPending}
                  leftIcon={<Download size={13} color={t.colors.primary} />}
                  onPress={() => exportOrg.mutate('xlsx')}
                  style={{ flex: 1 }}
                />
              </View>
              <Txt variant="placeholder" size={t.fontSize.xxs}>
                Saves to your device and opens the share sheet. JSON includes all raw data; Excel opens in any spreadsheet app.
              </Txt>
            </SectionCard>
          ) : null}

          {/* ── Notification preferences ── */}
          <NotificationsSection />

          {/* ── Domain peers ── */}
          <DomainPeersSection currentOrgId={currentOrgId} userId={user?.id} userEmail={user?.email ?? null} memberships={memberships} />

          {/* ── Danger zone (owner) ── */}
          {isOwner && membership ? (
            <SectionCard icon={<AlertTriangle size={18} color={t.colors.danger} />} title="Danger zone" description="Irreversible actions for owners." danger>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[3] }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="medium">Transfer ownership</Txt>
                  <Txt variant="subtle" size={t.fontSize.xs}>
                    Promote another member to owner. You become admin.
                  </Txt>
                </View>
                <Button title="Transfer" size="sm" variant="secondary" onPress={() => setShowTransfer(true)} />
              </View>
              <Divider />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[3] }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="medium">Delete organization</Txt>
                  <Txt variant="subtle" size={t.fontSize.xs}>
                    Permanently delete {membership.org_name} and all its data.
                  </Txt>
                </View>
                <Button title="Delete" size="sm" variant="danger" onPress={() => setShowDelete(true)} />
              </View>
            </SectionCard>
          ) : null}

          {/* ── Leave organization (non-owner) ── */}
          {membership && !isOwner ? (
            <SectionCard icon={<AlertTriangle size={18} color={t.colors.warning} />} title="Leave organization" description="Remove yourself from this org." warning>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[3] }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="medium">Leave {membership.org_name}</Txt>
                  <Txt variant="subtle" size={t.fontSize.xs}>
                    An admin can re-invite you later if needed.
                  </Txt>
                </View>
                <Button title="Leave" size="sm" variant="secondary" onPress={() => setShowLeave(true)} />
              </View>
            </SectionCard>
          ) : null}

          {/* ── Feedback ── */}
          <SectionCard icon={<MessageSquare size={18} color={t.colors.textSubtle} />} title="Feedback" description="Report a bug or suggest a feature.">
            <Button title="Send feedback" variant="secondary" onPress={() => setShowFeedback(true)} />
          </SectionCard>

          <Button
            title="Sign out"
            variant="danger"
            fullWidth
            onPress={async () => {
              if (await confirm({ title: 'Sign out?', description: 'You can sign back in anytime.', confirmLabel: 'Sign out', destructive: true })) {
                useAuthStore.getState().signOut();
              }
            }}
          />
        </View>
      </Screen>

      {showTransfer && membership && user ? (
        <TransferOwnershipModal orgId={membership.org_id} orgName={membership.org_name} callerUserId={user.id} onClose={() => setShowTransfer(false)} />
      ) : null}
      {showDelete && membership ? <DeleteOrgModal orgId={membership.org_id} orgName={membership.org_name} onClose={() => setShowDelete(false)} /> : null}
      {showLeave && membership ? <LeaveOrgModal orgId={membership.org_id} orgName={membership.org_name} onClose={() => setShowLeave(false)} /> : null}
      {showFeedback ? <FeedbackModal onClose={() => setShowFeedback(false)} /> : null}
    </View>
  );
}

// ── Notification preferences ─────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, any> = {
  Tickets: ClipboardList,
  Projects: FolderOpen,
  Membership: Users,
  Sprints: Layers,
};

function NotificationsSection() {
  const t = useTheme();
  const { data: items = [], isLoading } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  const grouped = useMemo(() => {
    const map = new Map<string, PreferenceItem[]>();
    for (const item of items) {
      const group = map.get(item.category) ?? [];
      group.push(item);
      map.set(item.category, group);
    }
    return map;
  }, [items]);

  if (isLoading) {
    return (
      <SectionCard icon={<Bell size={18} color={t.colors.textSubtle} />} title="Notifications" description="Email delivery preferences.">
        <Txt variant="subtle" size={t.fontSize.xs}>Loading…</Txt>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<Bell size={18} color={t.colors.textSubtle} />}
      title="Notifications"
      description="Choose which emails you receive. In-app notifications are always on."
    >
      {grouped.size === 0 ? (
        <Txt variant="subtle" size={t.fontSize.xs}>No configurable notifications yet.</Txt>
      ) : (
        Array.from(grouped.entries()).map(([category, prefs], ci) => {
          const CatIcon = CATEGORY_ICONS[category] ?? Bell;
          return (
            <View key={category}>
              {ci > 0 ? <Divider /> : null}
              {/* Category header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[1.5], marginBottom: t.spacing[2], marginTop: ci > 0 ? t.spacing[2] : 0 }}>
                <CatIcon size={13} color={t.colors.textSubtle} />
                <Txt variant="subtle" size={t.fontSize.xs} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {category}
                </Txt>
              </View>
              {/* Items */}
              {prefs.map((pref, pi) => (
                <View key={pref.type}>
                  {pi > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[3], paddingVertical: pi > 0 ? t.spacing[2] : 0 }}>
                    <Txt size={t.fontSize.sm} style={{ flex: 1 }} numberOfLines={2}>
                      {pref.label}
                    </Txt>
                    {pref.alwaysEmail ? (
                      <View style={{ paddingHorizontal: t.spacing[2], paddingVertical: 3, backgroundColor: t.colors.surfaceSunken, borderRadius: t.radius.sm, borderWidth: 1, borderColor: t.colors.border }}>
                        <Txt size={t.fontSize.xxs} variant="subtle" weight="medium">Always on</Txt>
                      </View>
                    ) : (
                      <Switch
                        value={pref.emailEnabled}
                        onValueChange={enabled => update.mutate({ type: pref.type, enabled })}
                        disabled={update.isPending && update.variables?.type === pref.type}
                        trackColor={{ false: t.colors.border, true: t.colors.primary }}
                        thumbColor="#fff"
                      />
                    )}
                  </View>
                </View>
              ))}
            </View>
          );
        })
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[1.5], marginTop: t.spacing[1] }}>
        <Bell size={11} color={t.colors.textPlaceholder} />
        <Txt variant="placeholder" size={t.fontSize.xxs}>In-app: always on</Txt>
      </View>
    </SectionCard>
  );
}

// ── Password change/reset state machine ──────────────────────────────────────
function PasswordSection({ email }: { email: string }) {
  const t = useTheme();
  const changePw = useChangePassword();
  const [mode, setMode] = useState<'closed' | 'change' | 'reset'>('closed');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setMode('closed');
    setCurrent('');
    setNext('');
    setConfirm('');
    setCode('');
    setCodeSent(false);
    setError(null);
  }

  function submitChange() {
    setError(null);
    if (next.length < 8) return setError('New password must be at least 8 characters');
    if (next !== confirm) return setError('Passwords do not match');
    if (next === current) return setError('New password must differ from current');
    changePw.mutate({ current, next }, { onSuccess: reset });
  }

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      await forgotPassword(email);
      setCodeSent(true);
      toast.success(`Code sent to ${email}`);
    } catch (e) {
      setError(extractApiError(e, 'Could not send code'));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    setError(null);
    if (!code.trim()) return setError('Enter the verification code');
    if (next.length < 8) return setError('New password must be at least 8 characters');
    if (next !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await confirmForgotPassword(email, code.trim(), next);
      toast.success('Password reset. You stay signed in.');
      reset();
    } catch (e) {
      setError(extractApiError(e, 'Could not reset password'));
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'closed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={t.fontSize.sm} color={t.colors.textPlaceholder}>
          ••••••••
        </Txt>
        <Button title="Change" size="sm" variant="secondary" onPress={() => setMode('change')} />
      </View>
    );
  }

  if (mode === 'change') {
    return (
      <View style={{ gap: t.spacing[2] }}>
        <TextField label="Current password" secure value={current} onChangeText={setCurrent} />
        <Pressable onPress={() => { setMode('reset'); setCurrent(''); setError(null); }} style={{ alignSelf: 'flex-start' }}>
          <Txt variant="link" size={t.fontSize.xs}>
            Forgot your password?
          </Txt>
        </Pressable>
        <TextField label="New password" secure value={next} onChangeText={setNext} hint="Minimum 8 characters" />
        <TextField label="Confirm new password" secure value={confirm} onChangeText={setConfirm} />
        {error ? <Txt color={t.colors.danger} size={t.fontSize.xs}>{error}</Txt> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing[2] }}>
          <Button title="Cancel" size="sm" variant="secondary" disabled={changePw.isPending} onPress={reset} />
          <Button title="Update" size="sm" loading={changePw.isPending} disabled={!current || !next || !confirm} onPress={submitChange} />
        </View>
      </View>
    );
  }

  // reset mode
  return (
    <View style={{ gap: t.spacing[2] }}>
      {!codeSent ? (
        <>
          <Txt weight="medium" size={t.fontSize.sm}>
            Reset password via email
          </Txt>
          <Txt variant="subtle" size={t.fontSize.xs}>
            We'll send a verification code to {email}. You stay signed in throughout.
          </Txt>
          {error ? <Txt color={t.colors.danger} size={t.fontSize.xs}>{error}</Txt> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing[2] }}>
            <Button title="← Back" size="sm" variant="ghost" onPress={() => { setMode('change'); setError(null); }} />
            <Button title="Send code" size="sm" loading={busy} onPress={sendCode} />
          </View>
        </>
      ) : (
        <>
          <Txt variant="subtle" size={t.fontSize.xs}>
            We sent a code to {email}. Enter it below with your new password.
          </Txt>
          <TextField label="Verification code" keyboardType="number-pad" value={code} onChangeText={setCode} placeholder="123456" />
          <Pressable onPress={sendCode} style={{ alignSelf: 'flex-end' }}>
            <Txt variant="link" size={t.fontSize.xs}>
              {busy ? 'Sending…' : 'Resend code'}
            </Txt>
          </Pressable>
          <TextField label="New password" secure value={next} onChangeText={setNext} hint="Minimum 8 characters" />
          <TextField label="Confirm new password" secure value={confirm} onChangeText={setConfirm} />
          {error ? <Txt color={t.colors.danger} size={t.fontSize.xs}>{error}</Txt> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing[2] }}>
            <Button title="Cancel" size="sm" variant="secondary" disabled={busy} onPress={reset} />
            <Button title="Reset password" size="sm" loading={busy} disabled={!code || !next || !confirm} onPress={submitReset} />
          </View>
        </>
      )}
    </View>
  );
}

// ── Trial banner ─────────────────────────────────────────────────────────────
function TrialBanner({ onSubscribe }: { onSubscribe: () => void }) {
  const t = useTheme();
  const { data } = useBillingSummary();
  if (!data || data.status !== 'trialing') return null;

  const days = data.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(data.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  return (
    <Pressable
      onPress={onSubscribe}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing[3],
        padding: t.spacing[3],
        borderRadius: t.radius.lg,
        borderWidth: 1,
        borderColor: withAlpha(t.colors.info ?? t.colors.primary, 0.35),
        backgroundColor: withAlpha(t.colors.info ?? t.colors.primary, 0.08),
      }}
    >
      <Calendar size={16} color={t.colors.info ?? t.colors.primary} style={{ flexShrink: 0 }} />
      <View style={{ flex: 1 }}>
        <Txt weight="semibold" size={t.fontSize.sm}>
          {days === 0 ? 'Your free trial has ended' : `${days} day${days === 1 ? '' : 's'} left in your free trial`}
        </Txt>
        <Txt variant="subtle" size={t.fontSize.xs}>
          Add a payment method to keep things running.
        </Txt>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: t.spacing[3],
          paddingVertical: t.spacing[1.5],
          borderRadius: t.radius.md,
          backgroundColor: t.colors.primary,
        }}
      >
        <Txt size={t.fontSize.xs} weight="semibold" color={t.colors.primaryText}>
          Subscribe
        </Txt>
      </View>
    </Pressable>
  );
}

// ── Domain peers ──────────────────────────────────────────────────────────────
function DomainPeersSection({
  currentOrgId,
  userId,
  userEmail,
  memberships,
}: {
  currentOrgId: string | null;
  userId: string | undefined;
  userEmail: string | null;
  memberships: { org_id: string }[];
}) {
  const t = useTheme();
  const { data: peers = [], isLoading } = useDomainPeers(userEmail);
  const { dismissed, dismiss, undismiss } = useDismissedDomainPeers(userId);
  const toggleDisc = useToggleOrgDiscoverable();

  const visible = peers.filter(p => p.id !== currentOrgId);
  if (isLoading || visible.length === 0) return null;

  return (
    <SectionCard
      icon={<Building2 size={18} color={t.colors.textSubtle} />}
      title="Other organizations in your email domain"
      description="Workspaces sharing your email domain. Pin to keep on the dashboard; owners can toggle visibility."
    >
      {visible.map((p, i) => {
        const ownedByMe = memberships.some(m => m.org_id === p.id);
        const isDismissed = dismissed.includes(p.id);
        return (
          <View key={p.id}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[2], paddingVertical: i > 0 ? t.spacing[2] : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], flex: 1 }}>
                <Txt size={t.fontSize.sm} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {p.name}
                </Txt>
                {ownedByMe ? <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase' }}>yours</Txt> : null}
                {ownedByMe && !p.discoverable ? <Txt size={t.fontSize.xxs} color={t.colors.warning} style={{ textTransform: 'uppercase' }}>hidden</Txt> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[1] }}>
                <Pressable
                  disabled={ownedByMe}
                  onPress={() => (isDismissed ? undismiss(p.id) : dismiss([p.id]))}
                  hitSlop={8}
                  style={{ padding: 6, opacity: ownedByMe ? 0.4 : 1 }}
                >
                  {isDismissed ? <PinOff size={16} color={t.colors.textPlaceholder} /> : <Pin size={16} color={t.colors.primary} />}
                </Pressable>
                {ownedByMe ? (
                  <Pressable onPress={() => toggleDisc.mutate({ orgId: p.id, discoverable: !p.discoverable })} hitSlop={8} style={{ padding: 6 }}>
                    {p.discoverable ? <Eye size={16} color={t.colors.primary} /> : <EyeOff size={16} color={t.colors.warning} />}
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </SectionCard>
  );
}
