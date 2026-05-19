const request = require('supertest');
const app = require('../../src/app');
const pool = require('../../src/config/database');
const { generateAccessToken } = require('../../src/utils/jwt');
const { v4: uuidv4 } = require('uuid');

describe('Payment Routes Integration Tests', () => {
  let userId, orderId, testUser, testOrder, authToken;

  beforeAll(async () => {
    try {
      // Create test user
      userId = uuidv4();
      testUser = {
        id: userId,
        email: `test-payment-${Date.now()}@example.com`,
        display_name: 'Test Payment User',
        password_hash: 'test_hash'
      };

      const userQuery = `
        INSERT INTO users (id, email, display_name, password_hash)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;

      await pool.query(userQuery, [
        testUser.id,
        testUser.email,
        testUser.display_name,
        testUser.password_hash
      ]);

      // Generate auth token
      authToken = generateAccessToken(testUser.id, 'user');

      // Create test order
      orderId = uuidv4();
      testOrder = {
        id: orderId,
        user_id: userId,
        total_price: 99.99,
        status: 'pending',
        payment_status: 'pending'
      };

      const orderQuery = `
        INSERT INTO orders (id, user_id, order_number, total_price, status, payment_status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;

      await pool.query(orderQuery, [
        testOrder.id,
        testOrder.user_id,
        `ORD-${Date.now()}-payment`,
        testOrder.total_price,
        testOrder.status,
        testOrder.payment_status
      ]);
    } catch (error) {
      console.error('Error setting up test data:', error);
    }
  });

  afterAll(async () => {
    try {
      // Clean up test data
      await pool.query('DELETE FROM payments WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM orders WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  });

  describe('POST /api/payments/create-intent', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/payments/create-intent')
        .send({ orderId: uuidv4() });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should require orderId in body', async () => {
      const response = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should create payment intent for valid order', async () => {
      const response = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ orderId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.paymentIntentId).toBeDefined();
      expect(response.body.data.clientSecret).toBeDefined();
      expect(response.body.data.amount).toBe(testOrder.total_price);
    });

    it('should reject for non-existent order', async () => {
      const fakeOrderId = uuidv4();
      const response = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ orderId: fakeOrderId });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should reject unauthorized user accessing other user\'s order', async () => {
      // Create another user's order
      const otherUserId = uuidv4();
      const otherOrderId = uuidv4();

      // Insert other user and order
      await pool.query(
        'INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [otherUserId, `other-${Date.now()}@example.com`, 'Other User', 'hash']
      );

      await pool.query(
        'INSERT INTO orders (id, user_id, order_number, total_price, status, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
        [otherOrderId, otherUserId, `ORD-${Date.now()}-other`, 50.00, 'pending', 'pending']
      );

      const response = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ orderId: otherOrderId });

      expect(response.status).toBe(403);

      // Clean up
      await pool.query('DELETE FROM orders WHERE id = $1', [otherOrderId]);
      await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
    });
  });

  describe('GET /api/payments/status/:paymentIntentId', () => {
    let createdPaymentIntentId;
    let statusTestOrderId;

    beforeAll(async () => {
      // Create a fresh order for status tests
      statusTestOrderId = uuidv4();
      await pool.query(
        'INSERT INTO orders (id, user_id, order_number, total_price, status, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
        [statusTestOrderId, userId, `ORD-${Date.now()}-status`, 99.99, 'pending', 'pending']
      );

      // Create a payment intent first
      const response = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ orderId: statusTestOrderId });

      createdPaymentIntentId = response.body.data.paymentIntentId;
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/payments/status/${createdPaymentIntentId}`);

      expect(response.status).toBe(401);
    });

    it('should return payment status for valid intent', async () => {
      const response = await request(app)
        .get(`/api/payments/status/${createdPaymentIntentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBeDefined();
      expect(response.body.data.paymentId).toBeDefined();
      expect(response.body.data.orderId).toBe(statusTestOrderId);
    });

    it('should reject invalid payment intent ID', async () => {
      const response = await request(app)
        .get('/api/payments/status/invalid_id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/payments/confirm', () => {
    let createdPaymentIntentId;
    let confirmTestOrderId;

    beforeAll(async () => {
      // Create a new order and payment intent for this test
      confirmTestOrderId = uuidv4();
      await pool.query(
        'INSERT INTO orders (id, user_id, order_number, total_price, status, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
        [confirmTestOrderId, userId, `ORD-${Date.now()}-confirm`, 75.00, 'pending', 'pending']
      );

      const response = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ orderId: confirmTestOrderId });

      createdPaymentIntentId = response.body.data.paymentIntentId;
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/payments/confirm')
        .send({
          paymentIntentId: createdPaymentIntentId,
          paymentMethodId: 'pm_test'
        });

      expect(response.status).toBe(401);
    });

    it('should require paymentIntentId and paymentMethodId', async () => {
      const response = await request(app)
        .post('/api/payments/confirm')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required fields');
    });
  });

  describe('POST /api/payments/webhook', () => {
    it('should require stripe-signature header', async () => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .send({
          type: 'payment_intent.succeeded',
          data: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/payments/refund/:paymentId', () => {
    it('should require authentication', async () => {
      const paymentId = uuidv4();
      const response = await request(app)
        .post(`/api/payments/refund/${paymentId}`)
        .send({});

      expect(response.status).toBe(401);
    });

    it('should reject invalid refund amount', async () => {
      const paymentId = uuidv4();
      const response = await request(app)
        .post(`/api/payments/refund/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: -10.00 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('positive');
    });

    it('should reject invalid refund reason', async () => {
      const paymentId = uuidv4();
      const response = await request(app)
        .post(`/api/payments/refund/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'invalid_reason' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('one of');
    });

    it('should reject non-existent payment', async () => {
      const fakePaymentId = uuidv4();
      const response = await request(app)
        .post(`/api/payments/refund/${fakePaymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'requested_by_customer' });

      expect(response.status).toBe(404);
    });
  });
});
