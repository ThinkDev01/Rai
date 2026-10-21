import React, { useState } from 'react';
import { View, Pressable, Linking, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, ExternalLink, Download, FileText, Calendar } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, Button, Divider, withAlpha } from '@/components/ui/primitives';
import { SubscriptionChip } from '@/components/ui/chips';
import { useTheme } from '@/theme/ThemeProvider';
import { useCurrentMembership } from '@/store/authStore';
import { toast } from '@/lib/toast';
import { billingUrl } from '@/config/billing';
import { useInvoices, useBillingSummary, formatInvoiceAmount, formatInvoiceDate } from '@/api/billing';

interface Plan {
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  pricePerUser: boolean;
  description: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: 'standard',
    name: 'Standard Plan',
    price: 50,
    billingCycle: 'month',
    pricePerUser: true,
    description: 'Full access to all features. Single plan, fully unlocked — billed per active member monthly.',
    features: [
      'Unlimited projects',
      'Sprint management',
      'Ticket tracking',
      'Team collaboration',
      'Email notifications',
      'Data export',
    ],
  },
];

export function SubscriptionPlansScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const membership = useCurrentMembership();
  const [selectedPlanId, setSelectedPlanId] = useState<string>(PLANS[0].id);
  const [loading, setLoading] = useState(false);
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const { data: billing } = useBillingSummary();

  async function openBilling() {
    const plan = PLANS.find(p => p.id === selectedPlanId);
    if (!plan || !membership) return;
    const url = billingUrl(membership.org_slug, plan.id);
    setLoading(true);
    try {
      await Linking.openURL(url);
    } catch {
      toast.error('Failed to open billing page. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Subscription Plans"
        subtitle="Choose a plan for your organization"
        onBack={() => nav.goBack()}
        showThemeToggle={false}
      />
      <Screen scroll>
        <View style={{ gap: t.spacing[4] }}>
          {/* Current subscription status */}
          {membership ? (
            <Card padded={false}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: t.spacing[4],
                }}
              >
                <Txt variant="subtle" size={t.fontSize.xs}>
                  Current status
                </Txt>
                <SubscriptionChip status={membership.subscription_status} size="sm" />
              </View>
            </Card>
          ) : null}

          <Txt variant="subtle" size={t.fontSize.sm}>
            Select a plan below. You'll be redirected to our website to complete the payment securely.
          </Txt>

          {PLANS.map(plan => {
            const selected = plan.id === selectedPlanId;
            return (
              <Card
                key={plan.id}
                padded={false}
                style={
                  selected
                    ? { borderColor: t.colors.primary, borderWidth: 2 }
                    : undefined
                }
              >
                <Pressable
                  onPress={() => setSelectedPlanId(plan.id)}
                  style={{ padding: t.spacing[4] }}
                >
                  {/* Plan header */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: t.spacing[2],
                        }}
                      >
                        <Txt weight="bold" size={t.fontSize.lg}>
                          {plan.name}
                        </Txt>
                        {selected ? (
                          <View
                            style={{
                              backgroundColor: t.colors.primary,
                              borderRadius: t.radius.full,
                              padding: 3,
                            }}
                          >
                            <Check size={11} color={t.colors.primaryText} />
                          </View>
                        ) : null}
                      </View>
                      <Txt
                        variant="subtle"
                        size={t.fontSize.xs}
                        style={{ marginTop: t.spacing[1] }}
                      >
                        {plan.description}
                      </Txt>
                    </View>

                    {/* Price */}
                    <View
                      style={{
                        alignItems: 'flex-end',
                        marginLeft: t.spacing[3],
                        backgroundColor: selected
                          ? withAlpha(t.colors.primary, 0.08)
                          : t.colors.surfaceSunken,
                        borderRadius: t.radius.lg,
                        paddingHorizontal: t.spacing[3],
                        paddingVertical: t.spacing[2],
                      }}
                    >
                      <View
                        style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}
                      >
                        <Txt
                          weight="bold"
                          size={t.fontSize.xl}
                          color={selected ? t.colors.primary : t.colors.text}
                        >
                          ₹{plan.price}
                        </Txt>
                      </View>
                      <Txt variant="subtle" size={t.fontSize.xxs}>
                        {plan.pricePerUser ? 'per user' : ''}/{plan.billingCycle}
                      </Txt>
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={{ marginVertical: t.spacing[3] }}>
                    <Divider />
                  </View>

                  {/* Features */}
                  <View style={{ gap: t.spacing[2] }}>
                    {plan.features.map(feature => (
                      <View
                        key={feature}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: t.spacing[2],
                        }}
                      >
                        <Check size={14} color={t.colors.success} />
                        <Txt size={t.fontSize.sm}>{feature}</Txt>
                      </View>
                    ))}
                  </View>
                </Pressable>
              </Card>
            );
          })}

          <Button
            title="Continue to Billing"
            fullWidth
            loading={loading}
            leftIcon={<ExternalLink size={16} color={t.colors.primaryText} />}
            onPress={openBilling}
          />

          <Txt
            variant="placeholder"
            size={t.fontSize.xxs}
            style={{ textAlign: 'center' }}
          >
            You'll be redirected to our secure website to complete the payment. No card
            details are stored in the app.
          </Txt>

          {/* Invoices & Receipts */}
          <Card padded={false}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing[2],
                padding: t.spacing[4],
                borderBottomWidth: 1,
                borderBottomColor: t.colors.border,
              }}
            >
              <FileText size={14} color={t.colors.textSubtle} />
              <Txt weight="semibold" size={t.fontSize.sm}>Invoices & Receipts</Txt>
            </View>

            {/* Pending subscription charge note — shown when auto-renew is active
                but no subscription invoice exists yet (first charge deferred). */}
            {billing?.auto_renew &&
             billing?.billing_mode === 'recurring' &&
             billing?.current_period_end &&
             !invoices.some(inv => inv.type === 'subscription') && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: t.spacing[2],
                  paddingHorizontal: t.spacing[4],
                  paddingVertical: t.spacing[3],
                  borderBottomWidth: 1,
                  borderBottomColor: t.colors.border,
                  backgroundColor: withAlpha(t.colors.info ?? t.colors.primary, 0.06),
                }}
              >
                <Calendar size={13} color={t.colors.textSubtle} style={{ marginTop: 2 }} />
                <Txt variant="subtle" size={t.fontSize.xs} style={{ flex: 1 }}>
                  Auto-renew is active. Your first subscription charge is scheduled for{' '}
                  <Txt size={t.fontSize.xs} weight="semibold">
                    {formatInvoiceDate(billing.current_period_end)}
                  </Txt>
                  . The subscription invoice will appear here once payment is processed.
                </Txt>
              </View>
            )}
            {invoicesLoading ? (
              <View style={{ padding: t.spacing[4], alignItems: 'center' }}>
                <ActivityIndicator size="small" color={t.colors.primary} />
              </View>
            ) : invoices.length === 0 ? (
              <View style={{ padding: t.spacing[4] }}>
                <Txt variant="placeholder" size={t.fontSize.sm}>
                  No invoices yet — receipts appear after your first payment.
                </Txt>
              </View>
            ) : (
              invoices.map((inv, index) => (
                <View key={inv.id}>
                  {index > 0 && <Divider />}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: t.spacing[4],
                      paddingVertical: t.spacing[3],
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                        <Txt size={t.fontSize.sm}>{formatInvoiceDate(inv.date)}</Txt>
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: t.radius.sm,
                            backgroundColor: inv.type === 'subscription'
                              ? withAlpha(t.colors.primary, 0.1)
                              : t.colors.surfaceSunken,
                          }}
                        >
                          <Txt
                            size={t.fontSize.xxs}
                            weight="medium"
                            color={inv.type === 'subscription' ? t.colors.primary : t.colors.textSubtle}
                          >
                            {inv.type === 'subscription' ? 'Subscription' : 'One-time'}
                          </Txt>
                        </View>
                      </View>
                      <Txt
                        variant="subtle"
                        size={t.fontSize.xs}
                        style={{ marginTop: 2, textTransform: 'capitalize' }}
                      >
                        {inv.status}
                      </Txt>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3] }}>
                      <Txt weight="semibold" size={t.fontSize.sm}>
                        {formatInvoiceAmount(inv.amountCents, inv.currency)}
                      </Txt>
                      {inv.downloadUrl ? (
                        <Pressable
                          onPress={async () => {
                            try {
                              await Linking.openURL(inv.downloadUrl!);
                            } catch {
                              toast.error('Could not open invoice.');
                            }
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: t.spacing[2],
                            paddingVertical: t.spacing[1],
                            borderRadius: t.radius.sm,
                            backgroundColor: withAlpha(t.colors.primary, 0.08),
                          }}
                        >
                          <Download size={13} color={t.colors.primary} />
                          <Txt size={t.fontSize.xs} color={t.colors.primary} weight="medium">
                            Download
                          </Txt>
                        </Pressable>
                      ) : (
                        <Txt variant="placeholder" size={t.fontSize.xs}>—</Txt>
                      )}
                    </View>
                  </View>
                </View>
              ))
            )}
          </Card>
        </View>
      </Screen>
    </View>
  );
}
