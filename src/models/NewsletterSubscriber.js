const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class NewsletterSubscriber {
  /**
   * Create a new subscriber, or no-op if email already exists.
   * If the email exists but is unsubscribed, reactivate it.
   * Returns { subscriber, isNew }
   */
  static async subscribe({ email, name, source, ipAddress, userAgent, metadata = {} }) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw new Error('valid email required');
    }

    const existing = await pool.query(
      'SELECT * FROM newsletter_subscribers WHERE email = $1',
      [normalized]
    );

    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.status === 'subscribed') {
        return { subscriber: row, isNew: false, alreadySubscribed: true };
      }
      // Reactivate previously unsubscribed
      const result = await pool.query(
        `UPDATE newsletter_subscribers
         SET status = 'subscribed',
             name = COALESCE($2, name),
             source = COALESCE($3, source),
             unsubscribed_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE email = $1
         RETURNING *`,
        [normalized, name || null, source || null]
      );
      return { subscriber: result.rows[0], isNew: false, reactivated: true };
    }

    const id = uuidv4();
    const unsubscribeToken = crypto.randomBytes(24).toString('hex');
    const result = await pool.query(
      `INSERT INTO newsletter_subscribers
        (id, email, name, source, ip_address, user_agent, status, unsubscribe_token, metadata, subscribed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'subscribed', $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, normalized, name || null, source || null, ipAddress || null, userAgent || null, unsubscribeToken, metadata]
    );
    return { subscriber: result.rows[0], isNew: true };
  }

  static async unsubscribeByToken(token) {
    if (!token || typeof token !== 'string') throw new Error('token required');
    const result = await pool.query(
      `UPDATE newsletter_subscribers
       SET status = 'unsubscribed', unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE unsubscribe_token = $1 AND status != 'unsubscribed'
       RETURNING email`,
      [token]
    );
    return result.rows[0] || null;
  }

  static async count() {
    const result = await pool.query("SELECT COUNT(*)::int AS n FROM newsletter_subscribers WHERE status = 'subscribed'");
    return result.rows[0].n;
  }
}

module.exports = NewsletterSubscriber;
