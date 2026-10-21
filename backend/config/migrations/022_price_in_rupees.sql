-- Billing price → whole Indian rupees (was paise / "cents"). Cleaner to read +
-- edit in the table. ₹50 was stored as 5000; becomes 50. We still convert to
-- paise only at the Razorpay boundary (its API requires the smallest unit) —
-- but the table and the app speak rupees.

-- Guarded so the migration is safe to re-run: the rename + divide only happen
-- if the old column still exists. If the DB was already renamed out-of-band
-- (column is already price_per_seat_inr), this no-ops instead of erroring with
-- "column price_per_seat_cents does not exist".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'price_per_seat_cents'
  ) THEN
    ALTER TABLE plans RENAME COLUMN price_per_seat_cents TO price_per_seat_inr;
    UPDATE plans SET price_per_seat_inr = price_per_seat_inr / 100;
  END IF;
END $$;
