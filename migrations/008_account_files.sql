-- Phase 3b: client-facing file deliverables.
-- Admin uploads files (stems, mixes, masters, design assets, contracts) to S3
-- and assigns them to a customer's account. Customer downloads via signed URL.

CREATE TABLE IF NOT EXISTS account_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  customer_email VARCHAR(255) NOT NULL,
  s3_bucket VARCHAR(128) NOT NULL DEFAULT 'donedealdigital-clientfiles',
  s3_key TEXT NOT NULL,
  filename VARCHAR(512) NOT NULL,
  content_type VARCHAR(255),
  size_bytes BIGINT,
  category VARCHAR(64),
  description TEXT,
  uploaded_by_admin_email VARCHAR(255),
  download_count INT DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_downloaded_at TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_user ON account_files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_email ON account_files(customer_email);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON account_files(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_files_deleted ON account_files(deleted_at);
