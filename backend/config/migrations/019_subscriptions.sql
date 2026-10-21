-- v2 Phase 4 — Billing.
--
-- Two tables: `plans` (the catalog — single "Standard" plan in v2) and
-- `subscriptions` (one live row per org with trial dates, billing period,
-- auto-renew choice, and nullable provider ids).
--
-- The READ-ONLY GATE still lives on `organizations.subscription_status`
-- (read by authMiddleware → requireOrgContext on every request, single join,
-- no extra round-trip). This table is the billing DETAIL; billing.service keeps
-- the two in sync (trialing/active → 'trial'/'active'; past_due/canceled →
-- 'suspended' read-only, NOT 'cancelled' — so members keep context and can
-- still reach the billing page to reactivate, per v2-decisions Q11).
--
-- Pricing model (matches Jira / Atlassian Cloud — see Guide/guide-billing.md):
--   bill = price_per_seat × PEAK active seats during the cycle (Maximum
--   Quantity Billing). Adds are prorated for the remaining days; removals get
--   no credit. `peak_seats` tracks the high-water mark for the current cycle.
--
-- Provider columns are nullable and staged for both Razorpay (v2 default) and
-- Stripe (future alt) so adding a provider is additive — no migration churn.

CREATE TABLE IF NOT EXISTS plans (
  id                   UUID         PRIMARY KEY,
  name                 VARCHAR(50)  NOT NULL,
  -- Stored in the smallest currency unit (paise for INR) to avoid float math.
  -- 5000 = ₹50.00 / seat / month. Changeable in place — single source of price.
  price_per_seat_cents INTEGER      NOT NULL,
  currency             CHAR(3)      NOT NULL DEFAULT 'INR',
  billing_interval     VARCHAR(10)  NOT NULL DEFAULT 'monthly'
                                    CHECK (billing_interval IN ('monthly', 'annual')),
  -- The recurring Plan created once in the Razorpay dashboard. Wired via env
  -- (RAZORPAY_PLAN_ID) at deploy time; nullable so the NoOp/dev path needs none.
  razorpay_plan_id     VARCHAR(64),
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID         PRIMARY KEY,
  org_id                   UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                  UUID         REFERENCES plans(id),

  -- Billing-detail status (richer than the org gate's 4 values).
  status                   VARCHAR(20)  NOT NULL DEFAULT 'trialing'
                                        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),

  -- 'recurring' = Razorpay auto-renews via UPI-autopay/card mandate.
  -- 'one_time'  = pay once per period, re-pay manually (the "no auto-renew" UX).
  billing_mode             VARCHAR(20)  NOT NULL DEFAULT 'recurring'
                                        CHECK (billing_mode IN ('recurring', 'one_time')),
  -- User-facing auto-renew toggle. For recurring subs, flipping this off marks
  -- the sub to cancel at period end. Independent column so the UI can show the
  -- intended state even before the provider confirms.
  auto_renew               BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Seats billed at the last invoice (snapshot). Live count is always derived
  -- from active members; `peak_seats` is the MQB high-water mark this cycle.
  seats                    INTEGER,
  peak_seats               INTEGER      NOT NULL DEFAULT 1,

  trial_started_at         TIMESTAMPTZ,
  trial_ends_at            TIMESTAMPTZ,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  -- Set when a user cancels; access continues until current_period_end.
  canceled_at              TIMESTAMPTZ,

  -- Invoices go here; defaults to owner.email at billing time when NULL.
  billing_email            VARCHAR(255),

  razorpay_customer_id     VARCHAR(64),
  razorpay_subscription_id VARCHAR(64),
  razorpay_order_id        VARCHAR(64),
  stripe_customer_id       VARCHAR(64),   -- staged, unused in v2
  stripe_subscription_id   VARCHAR(64),   -- staged, unused in v2

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- At most one LIVE subscription per org (trialing/active/past_due). Historical
-- 'canceled' rows are allowed, so re-subscribing after cancel just inserts a new
-- live row. Drives the per-request join.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_org_live
  ON subscriptions (org_id)
  WHERE status IN ('trialing', 'active', 'past_due');

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions (org_id);

-- Seed the single v2 plan if the catalog is empty. ₹50/seat/month default —
-- update price_per_seat_cents (and razorpay_plan_id at deploy) in place later.
INSERT INTO plans (id, name, price_per_seat_cents, currency, billing_interval)
SELECT gen_random_uuid(), 'Standard', 5000, 'INR', 'monthly'
WHERE NOT EXISTS (SELECT 1 FROM plans);
