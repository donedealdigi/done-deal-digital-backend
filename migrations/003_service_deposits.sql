-- Phase 1: Service Deposits
-- Customers can pay deposits directly on donedealdigital.com for
-- production/mixing/video/etc. services or for the four pricing-card
-- packages (Single, EP, Artist Development, A la carte).

CREATE TABLE IF NOT EXISTS service_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255),
  service_slug VARCHAR(100) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  deposit_type VARCHAR(50) NOT NULL CHECK (deposit_type IN ('fixed', 'package', 'custom')),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deposits_email ON service_deposits(customer_email);
CREATE INDEX IF NOT EXISTS idx_deposits_stripe_intent ON service_deposits(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON service_deposits(status);
CREATE INDEX IF NOT EXISTS idx_deposits_created ON service_deposits(created_at);

-- Make sure gen_random_uuid() is available (uses pgcrypto extension)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
