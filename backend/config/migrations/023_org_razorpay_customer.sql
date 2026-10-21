-- Move Razorpay customer ID to the organization level so it persists across
-- subscription cancellations / recreations, and guarantees one Razorpay customer
-- per org regardless of how many subscription rows come and go.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT;

-- Backfill from existing subscription rows so paying orgs keep their customer ID.
UPDATE organizations o
   SET razorpay_customer_id = (
         SELECT s.razorpay_customer_id
           FROM subscriptions s
          WHERE s.org_id = o.id
            AND s.razorpay_customer_id IS NOT NULL
          ORDER BY s.created_at DESC
          LIMIT 1
       )
 WHERE o.razorpay_customer_id IS NULL
   AND EXISTS (
         SELECT 1 FROM subscriptions s
          WHERE s.org_id = o.id AND s.razorpay_customer_id IS NOT NULL
       );
