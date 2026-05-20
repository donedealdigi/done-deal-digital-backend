-- Merch orders — captures Printful-fulfilled purchases from donedealdigital.com.
-- Customer pays via Stripe, we record here, then submit to Printful on payment success.
-- Idempotent migration.

CREATE TABLE IF NOT EXISTS merch_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255),
  items JSONB NOT NULL,
  shipping_address JSONB NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL CHECK (subtotal >= 0),
  shipping_cost DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  tax DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total DECIMAL(12, 2) NOT NULL CHECK (total > 0),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'submitted', 'fulfilled', 'shipped', 'delivered', 'canceled', 'failed')),
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  printful_order_id VARCHAR(255) UNIQUE,
  tracking_number VARCHAR(255),
  tracking_url TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  submitted_at TIMESTAMP,
  fulfilled_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_merch_email ON merch_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_merch_stripe ON merch_orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_merch_printful ON merch_orders(printful_order_id);
CREATE INDEX IF NOT EXISTS idx_merch_status ON merch_orders(status);
CREATE INDEX IF NOT EXISTS idx_merch_created ON merch_orders(created_at);
