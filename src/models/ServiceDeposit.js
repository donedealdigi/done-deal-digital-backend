const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ServiceDeposit {
  static async create(data) {
    const id = uuidv4();
    const now = new Date();
    const query = `
      INSERT INTO service_deposits
        (id, customer_email, customer_name, service_slug, service_name, deposit_type, amount, currency, status, stripe_payment_intent_id, notes, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
      RETURNING *
    `;
    const result = await pool.query(query, [
      id,
      data.customerEmail,
      data.customerName || null,
      data.serviceSlug,
      data.serviceName,
      data.depositType,
      data.amount,
      data.currency || 'USD',
      data.status || 'pending',
      data.stripePaymentIntentId,
      data.notes || null,
      data.metadata || {},
      now
    ]);
    return result.rows[0];
  }

  static async findByPaymentIntent(stripePaymentIntentId) {
    const result = await pool.query(
      'SELECT * FROM service_deposits WHERE stripe_payment_intent_id = $1',
      [stripePaymentIntentId]
    );
    return result.rows[0] || null;
  }

  static async markPaid(stripePaymentIntentId, stripeChargeId) {
    const result = await pool.query(
      `UPDATE service_deposits
       SET status = 'succeeded',
           stripe_charge_id = $2,
           paid_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_payment_intent_id = $1
       RETURNING *`,
      [stripePaymentIntentId, stripeChargeId]
    );
    return result.rows[0] || null;
  }

  static async markFailed(stripePaymentIntentId) {
    const result = await pool.query(
      `UPDATE service_deposits
       SET status = 'failed', updated_at = CURRENT_TIMESTAMP
       WHERE stripe_payment_intent_id = $1
       RETURNING *`,
      [stripePaymentIntentId]
    );
    return result.rows[0] || null;
  }
}

module.exports = ServiceDeposit;
