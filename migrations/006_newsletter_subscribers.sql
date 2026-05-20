-- Newsletter subscribers — emails captured from the donedealdigital.com
-- signup form. Stored in our DB so we don't lose anyone while we decide
-- on a provider (Mailchimp, Substack, ConvertKit, etc.). Later, the list
-- can be exported and imported into whichever ESP gets chosen.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  source VARCHAR(100),
  ip_address VARCHAR(64),
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  unsubscribe_token VARCHAR(64) UNIQUE,
  metadata JSONB,
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribed_at ON newsletter_subscribers(subscribed_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_unsub_token ON newsletter_subscribers(unsubscribe_token);
