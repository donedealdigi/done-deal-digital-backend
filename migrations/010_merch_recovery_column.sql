-- Abandoned-cart recovery: track whether a recovery ("you left something
-- behind") email has been sent for a pending merch order that never
-- completed payment. Fully idempotent — safe to re-run on every boot.

ALTER TABLE merch_orders ADD COLUMN IF NOT EXISTS recovery_email_sent_at TIMESTAMP;

-- Supports the recovery sweep query: pending orders, not yet emailed,
-- within the time window.
CREATE INDEX IF NOT EXISTS idx_merch_recovery
  ON merch_orders(status, recovery_email_sent_at, created_at);
