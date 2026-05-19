const request = require('supertest');
const app = require('../../src/app');
const pool = require('../../src/config/database');
const { generateAccessToken } = require('../../src/utils/jwt');
const { v4: uuidv4 } = require('uuid');

describe('Orders Routes Integration Tests', () => {
  let userId, testUser, authToken, createdOrderId;

  beforeAll(async () => {
    try {
      // Create test user
      userId = uuidv4();
      testUser = {
        id: userId,
        email: `test-orders-${Date.now()}@example.com`,
        display_name: 'Test Orders User',
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
    } catch (error) {
      console.error('Error setting up test data:', error);
    }
  });

  afterAll(async () => {
    try {
      // Clean up test data
      await pool.query('DELETE FROM orders WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  });

  describe('GET /api/orders', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/orders');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should return empty array for user with no orders', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orders).toEqual([]);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.limit).toBe(50);
      expect(response.body.data.pagination.offset).toBe(0);
    });

    it('should return user orders with pagination', async () => {
      // Create test orders
      const order1Id = uuidv4();
      const order2Id = uuidv4();

      await pool.query(
        'INSERT INTO orders (id, user_id, order_number, total_price, status, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
        [order1Id, userId, `ORD-${Date.now()}-1`, 50.00, 'pending', 'pending']
      );

      await pool.query(
        'INSERT INTO orders (id, user_id, order_number, total_price, status, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
        [order2Id, userId, `ORD-${Date.now()}-2`, 75.00, 'pending', 'pending']
      );

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orders.length).toBe(2);
      expect(response.body.data.pagination.count).toBe(2);

      // Clean up
      await pool.query('DELETE FROM orders WHERE id IN ($1, $2)', [order1Id, order2Id]);
    });

    it('should apply pagination limit and offset', async () => {
      const response = await request(app)
        .get('/api/orders?limit=10&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.limit).toBe(10);
      expect(response.body.data.pagination.offset).toBe(0);
    });

    it('should reject invalid pagination parameters', async () => {
      const response = await request(app)
        .get('/api/orders?limit=-5&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid pagination parameters');
    });

    it('should reject negative offset', async () => {
      const response = await request(app)
        .get('/api/orders?limit=50&offset=-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid pagination parameters');
    });
  });

  describe('GET /api/orders/:id', () => {
    let testOrderId;

    beforeAll(async () => {
      // Create test order
      testOrderId = uuidv4();
      await pool.query(
        'INSERT INTO orders (id, user_id, order_number, total_price, status, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
        [testOrderId, userId, `ORD-${Date.now()}-test`, 99.99, 'pending', 'pending']
      );
    });

    afterAll(async () => {
      // Clean up
      await pool.query('DELETE FROM orders WHERE id = $1', [testOrderId]);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrderId}`);

      expect(response.status).toBe(401);
    });

    it('should return order by ID', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testOrderId);
      expect(response.body.data.user_id).toBe(userId);
      expect(response.body.data.total_price).toBe(99.99);
      expect(response.body.data.status).toBe('pending');
    });

    it('should return 404 for non-existent order', async () => {
      const fakeOrderId = uuidv4();
      const response = await request(app)
        .get(`/api/orders/${fakeOrderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should reject unauthorized user accessing other user\'s order', async () => {
      // Create another user
      const otherUserId = uuidv4();
      const otherUserEmail = `other-${Date.now()}@example.com`;

      await pool.query(
        'INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [otherUserId, otherUserEmail, 'Other User', 'hash']
      );

      // Create order for other user
      const otherOrderId = uuidv4();
      await pool.query(
        'INSERT INTO orders (id, user_id, order_number, total_price, status, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
        [otherOrderId, otherUserId, `ORD-${Date.now()}-other`, 50.00, 'pending', 'pending']
      );

      // Try to access other user's order with our token
      const response = await request(app)
        .get(`/api/orders/${otherOrderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Unauthorized');

      // Clean up
      await pool.query('DELETE FROM orders WHERE id = $1', [otherOrderId]);
      await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
    });
  });

  describe('POST /api/orders', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          totalPrice: 99.99,
          items: []
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should create a new order', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          totalPrice: 149.99,
          items: [
            { id: 'item-1', name: 'Product 1', price: 100.00, quantity: 1 },
            { id: 'item-2', name: 'Product 2', price: 49.99, quantity: 1 }
          ],
          metadata: { source: 'mobile_app' }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(userId);
      expect(response.body.data.totalPrice).toBe(149.99);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.paymentStatus).toBe('pending');
      expect(response.body.data.orderId).toBeDefined();
      expect(response.body.data.orderNumber).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();

      createdOrderId = response.body.data.orderId;

      // Clean up
      await pool.query('DELETE FROM orders WHERE id = $1', [createdOrderId]);
    });

    it('should require totalPrice field', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: []
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('totalPrice');
    });

    it('should reject negative totalPrice', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          totalPrice: -50.00
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('positive number');
    });

    it('should reject zero totalPrice', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          totalPrice: 0
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('positive number');
    });

    it('should reject non-numeric totalPrice', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          totalPrice: 'not-a-number'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('positive number');
    });

    it('should handle optional items and metadata', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          totalPrice: 50.00
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toBeDefined();
      expect(response.body.data.metadata).toBeDefined();

      // Clean up
      await pool.query('DELETE FROM orders WHERE id = $1', [response.body.data.orderId]);
    });

    it('should generate unique order numbers', async () => {
      const response1 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ totalPrice: 50.00 });

      const response2 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ totalPrice: 60.00 });

      expect(response1.body.data.orderNumber).not.toBe(response2.body.data.orderNumber);

      // Clean up
      await pool.query('DELETE FROM orders WHERE id IN ($1, $2)', [
        response1.body.data.orderId,
        response2.body.data.orderId
      ]);
    });

    it('should store items as JSON', async () => {
      const items = [
        { id: 'item-1', name: 'Test Product', price: 29.99, quantity: 2 }
      ];

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          totalPrice: 59.98,
          items
        });

      expect(response.status).toBe(201);
      expect(response.body.data.items).toEqual(items);

      // Clean up
      await pool.query('DELETE FROM orders WHERE id = $1', [response.body.data.orderId]);
    });

    it('should store metadata as JSON', async () => {
      const metadata = {
        source: 'web',
        campaign: 'spring_sale',
        referrer: 'google'
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          totalPrice: 75.00,
          metadata
        });

      expect(response.status).toBe(201);
      expect(response.body.data.metadata).toEqual(metadata);

      // Clean up
      await pool.query('DELETE FROM orders WHERE id = $1', [response.body.data.orderId]);
    });
  });
});
