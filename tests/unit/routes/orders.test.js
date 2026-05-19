// Mock the Order model BEFORE importing routes
jest.mock('../../../src/models/Order');

// Mock the auth middleware to inject test user
jest.mock('../../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com'
    };
    next();
  }
}));

const request = require('supertest');
const express = require('express');
const ordersRouter = require('../../../src/routes/orders');
const Order = require('../../../src/models/Order');
const { authenticate } = require('../../../src/middleware/auth');

// Create a test app with the orders router
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/orders', ordersRouter);
  return app;
};

describe('Orders Router Unit Tests', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('GET /orders', () => {
    it('should return user orders with default pagination', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          user_id: 'test-user-id',
          total_price: 99.99,
          status: 'pending',
          payment_status: 'pending'
        },
        {
          id: 'order-2',
          user_id: 'test-user-id',
          total_price: 149.99,
          status: 'pending',
          payment_status: 'pending'
        }
      ];

      Order.findByUserId.mockResolvedValue(mockOrders);

      const response = await request(app)
        .get('/orders');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orders).toEqual(mockOrders);
      expect(response.body.data.pagination.limit).toBe(50);
      expect(response.body.data.pagination.offset).toBe(0);
      expect(Order.findByUserId).toHaveBeenCalledWith('test-user-id', 50, 0);
    });

    it('should apply custom pagination parameters', async () => {
      Order.findByUserId.mockResolvedValue([]);

      const response = await request(app)
        .get('/orders?limit=25&offset=10');

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.limit).toBe(25);
      expect(response.body.data.pagination.offset).toBe(10);
      expect(Order.findByUserId).toHaveBeenCalledWith('test-user-id', 25, 10);
    });

    it('should reject invalid limit', async () => {
      const response = await request(app)
        .get('/orders?limit=-5');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid pagination parameters');
    });

    it('should reject negative offset', async () => {
      const response = await request(app)
        .get('/orders?offset=-1');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid pagination parameters');
    });

    it('should handle database errors gracefully', async () => {
      Order.findByUserId.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/orders');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to fetch orders');
    });
  });

  describe('GET /orders/:id', () => {
    it('should return order by ID', async () => {
      const mockOrder = {
        id: 'order-123',
        user_id: 'test-user-id',
        total_price: 99.99,
        status: 'pending',
        payment_status: 'pending'
      };

      Order.findById.mockResolvedValue(mockOrder);

      const response = await request(app)
        .get('/orders/order-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockOrder);
      expect(Order.findById).toHaveBeenCalledWith('order-123');
    });

    it('should return 404 if order not found', async () => {
      Order.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/orders/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should return 403 if user does not own the order', async () => {
      const mockOrder = {
        id: 'order-123',
        user_id: 'other-user-id',
        total_price: 99.99,
        status: 'pending'
      };

      Order.findById.mockResolvedValue(mockOrder);

      const response = await request(app)
        .get('/orders/order-123');

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Unauthorized');
    });

    it('should return user orders when accessing root path with trailing slash', async () => {
      // Note: /orders/ with trailing slash matches the root GET / route, not /:id
      // So this tests the root route behavior, not the /:id validation
      const mockOrders = [];
      Order.findByUserId.mockResolvedValue(mockOrders);

      const response = await request(app)
        .get('/orders/');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orders).toEqual(mockOrders);
    });

    it('should handle database errors gracefully', async () => {
      Order.findById.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/orders/order-123');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to fetch order');
    });
  });

  describe('POST /orders', () => {
    it('should create a new order', async () => {
      const mockOrder = {
        id: 'order-new-123',
        user_id: 'test-user-id',
        order_number: 'ORD-ABC123-DEF456',
        total_price: 149.99,
        status: 'pending',
        payment_status: 'pending',
        items: [{ id: 'item-1', name: 'Product', price: 149.99 }],
        metadata: { source: 'web' },
        created_at: new Date(),
        updated_at: new Date()
      };

      Order.create.mockResolvedValue(mockOrder);

      const response = await request(app)
        .post('/orders')
        .send({
          totalPrice: 149.99,
          items: [{ id: 'item-1', name: 'Product', price: 149.99 }],
          metadata: { source: 'web' }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orderId).toBe('order-new-123');
      expect(response.body.data.totalPrice).toBe(149.99);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.paymentStatus).toBe('pending');
      expect(Order.create).toHaveBeenCalledWith({
        userId: 'test-user-id',
        totalPrice: 149.99,
        status: 'pending',
        items: [{ id: 'item-1', name: 'Product', price: 149.99 }],
        metadata: { source: 'web' }
      });
    });

    it('should create order with default items and metadata', async () => {
      const mockOrder = {
        id: 'order-new-456',
        user_id: 'test-user-id',
        order_number: 'ORD-XYZ789-UVW012',
        total_price: 99.99,
        status: 'pending',
        payment_status: 'pending',
        items: [],
        metadata: {},
        created_at: new Date(),
        updated_at: new Date()
      };

      Order.create.mockResolvedValue(mockOrder);

      const response = await request(app)
        .post('/orders')
        .send({ totalPrice: 99.99 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(Order.create).toHaveBeenCalledWith({
        userId: 'test-user-id',
        totalPrice: 99.99,
        status: 'pending',
        items: [],
        metadata: {}
      });
    });

    it('should return 400 if totalPrice is missing', async () => {
      const response = await request(app)
        .post('/orders')
        .send({ items: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('totalPrice');
    });

    it('should return 400 if totalPrice is null', async () => {
      const response = await request(app)
        .post('/orders')
        .send({ totalPrice: null });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('totalPrice');
    });

    it('should return 400 if totalPrice is negative', async () => {
      const response = await request(app)
        .post('/orders')
        .send({ totalPrice: -50.00 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('positive number');
    });

    it('should return 400 if totalPrice is zero', async () => {
      const response = await request(app)
        .post('/orders')
        .send({ totalPrice: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('positive number');
    });

    it('should return 400 if totalPrice is not a number', async () => {
      const response = await request(app)
        .post('/orders')
        .send({ totalPrice: 'not-a-number' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('positive number');
    });

    it('should handle database errors gracefully', async () => {
      Order.create.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/orders')
        .send({ totalPrice: 99.99 });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to create order');
    });

    it('should return created order with all expected fields', async () => {
      const now = new Date();
      const mockOrder = {
        id: 'order-complete',
        user_id: 'test-user-id',
        order_number: 'ORD-TIMESTAMP-RANDOM',
        total_price: 199.99,
        status: 'pending',
        payment_status: 'pending',
        items: [],
        metadata: {},
        created_at: now,
        updated_at: now
      };

      Order.create.mockResolvedValue(mockOrder);

      const response = await request(app)
        .post('/orders')
        .send({ totalPrice: 199.99 });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('orderId');
      expect(response.body.data).toHaveProperty('orderNumber');
      expect(response.body.data).toHaveProperty('userId');
      expect(response.body.data).toHaveProperty('totalPrice');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('paymentStatus');
      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data).toHaveProperty('metadata');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });

    it('should handle complex items and metadata', async () => {
      const items = [
        { id: 'item-1', name: 'Beat 1', price: 99.99, quantity: 1 },
        { id: 'item-2', name: 'Beat 2', price: 79.99, quantity: 1 }
      ];
      const metadata = {
        source: 'mobile_app',
        campaign: 'spring_sale',
        referrer: 'google',
        sessionId: 'session-123'
      };

      const mockOrder = {
        id: 'order-complex',
        user_id: 'test-user-id',
        order_number: 'ORD-123-456',
        total_price: 179.98,
        status: 'pending',
        payment_status: 'pending',
        items,
        metadata,
        created_at: new Date(),
        updated_at: new Date()
      };

      Order.create.mockResolvedValue(mockOrder);

      const response = await request(app)
        .post('/orders')
        .send({
          totalPrice: 179.98,
          items,
          metadata
        });

      expect(response.status).toBe(201);
      expect(response.body.data.items).toEqual(items);
      expect(response.body.data.metadata).toEqual(metadata);
    });
  });
});
