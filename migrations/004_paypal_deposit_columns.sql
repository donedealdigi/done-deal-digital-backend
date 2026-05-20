-- Add PayPal columns to service_deposits so deposits can be made via PayPal
-- as well as Stripe. Existing Stripe deposits unaffected.
-- Idempotent.

ALTER TABLE service_deposits
  ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS paypal_capture_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT 'stripe' CHECK (payment_provider IN ('stripe', 'paypal'));

CREATE INDEX IF NOT EXISTS idx_deposits_paypal_order ON service_deposits(paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_deposits_provider ON service_deposits(payment_provider);

-- The stripe_payment_intent_id column is currently NOT NULL UNIQUE.
-- We need it nullable now since PayPal deposits won't have one.
ALTER TABLE service_deposits ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;
