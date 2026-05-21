const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class MerchOrder {
  static async create(data) {
    const id = uuidv4();
    const now = new Date();
    const query = `
      INSERT INTO merch_orders
        (id, customer_email, customer_name, items, shipping_address,
         subtotal, shipping_cost, tax, total, currency, status,
         stripe_payment_intent_id, paypal_order_id, payment_provider,
         notes, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
      RETURNING *
    `;
    const result = await pool.query(query, [
      id,
      data.customerEmail,
      data.customerName || null,
      JSON.stringify(data.items),
      JSON.stringify(data.shippingAddress),
      data.subtotal,
      data.shippingCost || 0,
      data.tax || 0,
      data.total,
      data.currency || 'USD',
      data.status || 'pending',
      data.stripePaymentIntentId || null,
      data.paypalOrderId || null,
      data.paymentProvider || 'stripe',
      data.notes || null,
      data.metadata || {},
      now
    ]);
    return result.rows[0];
  }

  static async findByPaypalOrderId(paypalOrderId) {
    const result = await pool.query(
      'SELECT * FROM merch_orders WHERE paypal_order_id = $1',
      [paypalOrderId]
    );
    return result.rows[0] || null;
  }

  static async markPaypalCaptured(paypalOrderId) {
    const result = await pool.query(
      `UPDATE merch_orders
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE paypal_order_id = $1
       RETURNING *`,
      [paypalOrderId]
    );
    return result.rows[0] || null;
  }

  static async findByPaymentIntent(stripePaymentIntentId) {
    const result = await pool.query(
      'SELECT * FROM merch_orders WHERE stripe_payment_intent_id = $1',
      [stripePaymentIntentId]
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM merch_orders WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async markPaid(stripePaymentIntentId) {
    const result = await pool.query(
      `UPDATE merch_orders
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE stripe_payment_intent_id = $1
       RETURNING *`,
      [stripePaymentIntentId]
    );
    return result.rows[0] || null;
  }

  static async markSubmitted(id, printfulOrderId) {
    const result = await pool.query(
      `UPDATE merch_orders
       SET status = 'submitted',
           printful_order_id = $2,
           submitted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, printfulOrderId]
    );
    return result.rows[0] || null;
  }

  static async markFulfilled(printfulOrderId, { trackingNumber, trackingUrl } = {}) {
    const result = await pool.query(
      `UPDATE merch_orders
       SET status = 'fulfilled',
           tracking_number = COALESCE($2, tracking_number),
           tracking_url = COALESCE($3, tracking_url),
           fulfilled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE printful_order_id = $1
       RETURNING *`,
      [printfulOrderId, trackingNumber, trackingUrl]
    );
    return result.rows[0] || null;
  }

  static async markFailed(stripePaymentIntentId) {
    const result = await pool.query(
      `UPDATE merch_orders
       SET status = 'failed', updated_at = CURRENT_TIMESTAMP
       WHERE stripe_payment_intent_id = $1
       RETURNING *`,
      [stripePaymentIntentId]
    );
    return result.rows[0] || null;
  }
}

module.exports = MerchOrder;
