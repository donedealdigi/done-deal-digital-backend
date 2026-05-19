const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Payment {
  /**
   * Create a new payment record
   */
  static async create(paymentData) {
    const {
      orderId,
      userId,
      stripePaymentIntentId,
      paypalOrderId,
      amount,
      currency = 'USD',
      paymentMethodType,
      metadata = {}
    } = paymentData;

    const id = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO payments (
        id,
        order_id,
        user_id,
        stripe_payment_intent_id,
        paypal_order_id,
        amount,
        currency,
        status,
        payment_method_type,
        metadata,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      orderId,
      userId,
      stripePaymentIntentId,
      paypalOrderId || null,
      amount,
      currency,
      'pending',
      paymentMethodType,
      JSON.stringify(metadata),
      now,
      now
    ]);

    return result.rows[0];
  }

  /**
   * Find payment by ID
   */
  static async findById(paymentId) {
    const query = 'SELECT * FROM payments WHERE id = $1';
    const result = await pool.query(query, [paymentId]);
    return result.rows[0] || null;
  }

  /**
   * Find payment by Stripe payment intent ID
   */
  static async findByStripePaymentIntentId(stripePaymentIntentId) {
    const query = 'SELECT * FROM payments WHERE stripe_payment_intent_id = $1';
    const result = await pool.query(query, [stripePaymentIntentId]);
    return result.rows[0] || null;
  }

  /**
   * Find payments by order ID
   */
  static async findByOrderId(orderId) {
    const query = 'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [orderId]);
    return result.rows;
  }

  /**
   * Find payment by PayPal order ID
   */
  static async findByPaypalOrderId(paypalOrderId) {
    const query = 'SELECT * FROM payments WHERE paypal_order_id = $1';
    const result = await pool.query(query, [paypalOrderId]);
    return result.rows[0] || null;
  }

  /**
   * Find payments by user ID
   */
  static async findByUserId(userId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM payments
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Update payment status
   */
  static async updateStatus(paymentId, status, additionalData = {}) {
    const updates = ['status = $2', 'updated_at = $3'];
    const values = [paymentId, status, new Date()];
    let paramIndex = 4;

    // Add stripe charge ID if provided
    if (additionalData.stripeChargeId) {
      updates.push(`stripe_charge_id = $${paramIndex}`);
      values.push(additionalData.stripeChargeId);
      paramIndex++;
    }

    // Add last four if provided
    if (additionalData.lastFour) {
      updates.push(`last_four = $${paramIndex}`);
      values.push(additionalData.lastFour);
      paramIndex++;
    }

    // Add receipt URL if provided
    if (additionalData.receiptUrl) {
      updates.push(`receipt_url = $${paramIndex}`);
      values.push(additionalData.receiptUrl);
      paramIndex++;
    }

    // Add PayPal transaction ID if provided
    if (additionalData.paypalTransactionId) {
      updates.push(`paypal_transaction_id = $${paramIndex}`);
      values.push(additionalData.paypalTransactionId);
      paramIndex++;
    }

    const query = `
      UPDATE payments
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Update order payment status
   */
  static async updateOrderPaymentStatus(orderId, paymentStatus) {
    const query = `
      UPDATE orders
      SET payment_status = $1, updated_at = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [paymentStatus, new Date(), orderId]);
    return result.rows[0] || null;
  }

  /**
   * Mark payment as paid
   */
  static async markAsPaid(paymentId, stripeChargeId, receiptUrl) {
    return this.updateStatus(paymentId, 'succeeded', {
      stripeChargeId,
      receiptUrl
    });
  }

  /**
   * Get payment statistics
   */
  static async getStats() {
    const query = `
      SELECT
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as successful_payments,
        SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as total_revenue,
        AVG(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as avg_payment,
        MIN(amount) as min_payment,
        MAX(amount) as max_payment
      FROM payments
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }

  /**
   * Get recent successful payments
   */
  static async getRecentSuccessful(limit = 20) {
    const query = `
      SELECT
        p.id,
        p.user_id,
        p.order_id,
        p.amount,
        p.currency,
        p.stripe_charge_id,
        p.last_four,
        p.created_at,
        u.email,
        u.display_name
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.status = 'succeeded'
      ORDER BY p.created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows;
  }
}

module.exports = Payment;
