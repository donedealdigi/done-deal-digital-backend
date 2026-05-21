-- Add PayPal columns to merch_orders so customers can pay via PayPal in addition
-- to Stripe. Stripe path uses payment_intent.succeeded webhook for fulfillment;
-- PayPal path captures synchronously in the capture endpoint.
-- Idempotent.

ALTER TABLE merch_orders ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255);
ALTER TABLE merch_orders ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT 'stripe' CHECK (payment_provider IN ('stripe', 'paypal'));

-- Unique index (only when populated) so multiple Stripe-only orders don't collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_merch_paypal_order_id
  ON merch_orders(paypal_order_id) WHERE paypal_order_id IS NOT NULL;

-- stripe_payment_intent_id needs to allow NULL for PayPal-only orders (it was UNIQUE NOT-NULL by default UNIQUE constraint; we need to ensure NULLs are accepted).
ALTER TABLE merch_orders ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;
