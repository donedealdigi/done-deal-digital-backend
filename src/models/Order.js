const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Order {
  /**
   * Create a new order
   */
  static async create(orderData) {
    const {
      userId,
      totalPrice,
      status = 'pending',
      items = [],
      metadata = {}
    } = orderData;

    const id = uuidv4();
    const orderNumber = this.generateOrderNumber();
    const now = new Date();

    const query = `
      INSERT INTO orders (
        id,
        user_id,
        order_number,
        total_price,
        status,
        items,
        metadata,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      userId,
      orderNumber,
      totalPrice,
      status,
      JSON.stringify(items),
      JSON.stringify(metadata),
      now,
      now
    ]);

    return result.rows[0];
  }

  /**
   * Find order by ID
   */
  static async findById(orderId) {
    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await pool.query(query, [orderId]);
    return result.rows[0] || null;
  }

  /**
   * Find orders by user ID
   */
  static async findByUserId(userId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM orders
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Find order by order number
   */
  static async findByOrderNumber(orderNumber) {
    const query = 'SELECT * FROM orders WHERE order_number = $1';
    const result = await pool.query(query, [orderNumber]);
    return result.rows[0] || null;
  }

  /**
   * Find order by Stripe payment intent ID
   */
  static async findByStripePaymentIntentId(stripePaymentIntentId) {
    const query = 'SELECT * FROM orders WHERE stripe_payment_intent_id = $1';
    const result = await pool.query(query, [stripePaymentIntentId]);
    return result.rows[0] || null;
  }

  /**
   * Update an order
   */
  static async update(orderId, updateData) {
    const updates = [];
    const values = [orderId];
    let paramIndex = 2;

    // Build dynamic update query
    if (updateData.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(updateData.status);
      paramIndex++;
    }

    if (updateData.payment_status !== undefined) {
      updates.push(`payment_status = $${paramIndex}`);
      values.push(updateData.payment_status);
      paramIndex++;
    }

    if (updateData.stripe_payment_intent_id !== undefined) {
      updates.push(`stripe_payment_intent_id = $${paramIndex}`);
      values.push(updateData.stripe_payment_intent_id);
      paramIndex++;
    }

    if (updateData.paid_at !== undefined) {
      updates.push(`paid_at = $${paramIndex}`);
      values.push(updateData.paid_at);
      paramIndex++;
    }

    if (updateData.total_price !== undefined) {
      updates.push(`total_price = $${paramIndex}`);
      values.push(updateData.total_price);
      paramIndex++;
    }

    if (updateData.items !== undefined) {
      updates.push(`items = $${paramIndex}`);
      values.push(JSON.stringify(updateData.items));
      paramIndex++;
    }

    if (updateData.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex}`);
      values.push(JSON.stringify(updateData.metadata));
      paramIndex++;
    }

    // Always update updated_at
    updates.push(`updated_at = $${paramIndex}`);
    values.push(new Date());

    if (updates.length === 1) {
      // Only updated_at, no other changes
      return this.findById(orderId);
    }

    const query = `
      UPDATE orders
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Get orders with pagination
   */
  static async getAll(limit = 50, offset = 0) {
    const query = `
      SELECT * FROM orders
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const result = await pool.query(query, [limit, offset]);
    return result.rows;
  }

  /**
   * Get orders by status
   */
  static async getByStatus(status, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM orders
      WHERE status = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [status, limit, offset]);
    return result.rows;
  }

  /**
   * Get orders by payment status
   */
  static async getByPaymentStatus(paymentStatus, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM orders
      WHERE payment_status = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [paymentStatus, limit, offset]);
    return result.rows;
  }

  /**
   * Get order statistics
   */
  static async getStats() {
    const query = `
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_orders,
        SUM(CASE WHEN status = 'confirmed' THEN total_price ELSE 0 END) as total_revenue,
        AVG(CASE WHEN status = 'confirmed' THEN total_price ELSE 0 END) as avg_order_value,
        MIN(total_price) as min_order,
        MAX(total_price) as max_order
      FROM orders
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }

  /**
   * Generate unique order number
   */
  static generateOrderNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ORD-${timestamp}-${random}`;
  }
}

module.exports = Order;
