-- Phase 2B.3: Payment Processing with Stripe Integration
-- Add payment tracking fields and create payments table

-- ===== PAYMENTS TABLE =====
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  user_id UUID NOT NULL REFERENCES users(id),
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'processing', 'requires_payment_method', 'requires_confirmation', 'requires_action', 'canceled')),
  payment_method_type VARCHAR(50),
  last_four VARCHAR(4),
  receipt_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_order (order_id),
  INDEX idx_stripe_intent (stripe_payment_intent_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
);

-- ===== ALTER ORDERS TABLE =====
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded')),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_orders_stripe_intent ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

-- ===== REFUNDS TABLE =====
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  stripe_refund_id VARCHAR(255) UNIQUE,
  amount DECIMAL(12, 2) NOT NULL,
  reason VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment (payment_id),
  INDEX idx_stripe_refund (stripe_refund_id),
  INDEX idx_status (status)
);
