const request = require('supertest');
const app = require('../../src/app');
const pool = require('../../src/config/database');
const Product = require('../../src/models/Product');

// Mock the database pool
jest.mock('../../src/config/database');

// Mock authentication middleware
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'user-123', role: 'admin' };
    next();
  },
  authorize: (roles) => (req, res, next) => {
    if (roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ success: false, error: 'Forbidden' });
    }
  }
}));

describe('Products Endpoints', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/products', () => {
    it('should return paginated products', async () => {
      const mockProducts = [
        { id: '1', name: 'Product 1', slug: 'prod-1', price: '10', stock_quantity: 5, image_urls: '[]', specifications: '{}' },
        { id: '2', name: 'Product 2', slug: 'prod-2', price: '20', stock_quantity: 10, image_urls: '[]', specifications: '{}' }
      ];

      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: mockProducts });

      const res = await request(app).get('/api/products');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.total).toBe(100);
      expect(res.body.pagination.pages).toBe(5);
    });

    it('should handle pagination parameters', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '50' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/products?page=2&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(10);
    });

    it('should validate pagination parameters', async () => {
      const res = await request(app).get('/api/products?page=0&limit=200');

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('GET /api/products/category/:category', () => {
    it('should return products by category', async () => {
      const mockProducts = [
        { id: '1', name: 'Hip Hop Beat', slug: 'hiphop-1', price: '49.99', stock_quantity: 5, image_urls: '[]', specifications: '{}' }
      ];

      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '15' }] })
        .mockResolvedValueOnce({ rows: mockProducts });

      const res = await request(app).get('/api/products/category/hip-hop');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/products/search/:query', () => {
    it('should search products', async () => {
      const mockProducts = [
        { id: '1', name: 'Test Beat', slug: 'test-beat', price: '29.99', stock_quantity: 10, image_urls: '[]', specifications: '{}' }
      ];

      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: mockProducts });

      const res = await request(app).get('/api/products/search/beat');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should return single product by ID', async () => {
      const mockProduct = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test Beat',
        slug: 'test-beat',
        price: '29.99',
        stock_quantity: 10,
        image_urls: '[]',
        specifications: '{}'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app).get('/api/products/550e8400-e29b-41d4-a716-446655440001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Beat');
    });

    it('should return 404 if product not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/products/550e8400-e29b-41d4-a716-446655440099');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Product not found');
    });

    it('should validate UUID format', async () => {
      const res = await request(app).get('/api/products/invalid-id');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/products', () => {
    it('should create new product', async () => {
      const mockProduct = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'New Beat',
        slug: 'new-beat',
        description: 'A new beat',
        category: 'hip-hop',
        price: '39.99',
        stock_quantity: 20,
        image_urls: '[]',
        specifications: '{}'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app)
        .post('/api/products')
        .send({
          name: 'New Beat',
          slug: 'new-beat',
          description: 'A new beat',
          category: 'hip-hop',
          price: 39.99,
          stock_quantity: 20
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Beat');
      expect(res.body.message).toBe('Product created successfully');
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/products')
        .send({
          description: 'Missing required fields'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should handle duplicate slug error', async () => {
      const error = new Error('duplicate key');
      error.code = '23505';
      pool.query.mockRejectedValueOnce(error);

      const res = await request(app)
        .post('/api/products')
        .send({
          name: 'Test',
          slug: 'existing-slug',
          price: 29.99
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should update product', async () => {
      const mockProduct = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Updated Beat',
        slug: 'updated-beat',
        price: '49.99',
        stock_quantity: 15
      };

      pool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app)
        .put('/api/products/550e8400-e29b-41d4-a716-446655440002')
        .send({
          name: 'Updated Beat',
          price: 49.99
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Beat');
      expect(res.body.message).toBe('Product updated successfully');
    });

    it('should return 404 if product not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/products/550e8400-e29b-41d4-a716-446655440099')
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should delete product', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440001' }] });

      const res = await request(app).delete('/api/products/550e8400-e29b-41d4-a716-446655440001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product deleted successfully');
    });

    it('should return 404 if product not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/products/550e8400-e29b-41d4-a716-446655440099');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/products/:id/stock', () => {
    it('should update stock quantity', async () => {
      const mockProduct = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        stock_quantity: 50,
        image_urls: '[]',
        specifications: '{}'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app)
        .put('/api/products/550e8400-e29b-41d4-a716-446655440001/stock')
        .send({ quantity: 50 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Stock updated to 50');
    });

    it('should validate quantity', async () => {
      const res = await request(app)
        .put('/api/products/550e8400-e29b-41d4-a716-446655440001/stock')
        .send({ quantity: -10 });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/products/:id/adjust-stock', () => {
    it('should adjust stock by amount', async () => {
      const mockProduct = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        stock_quantity: 35,
        image_urls: '[]',
        specifications: '{}'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app)
        .put('/api/products/550e8400-e29b-41d4-a716-446655440001/adjust-stock')
        .send({ adjustment: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('10 units added');
    });

    it('should handle negative adjustments', async () => {
      const mockProduct = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        stock_quantity: 20,
        image_urls: '[]',
        specifications: '{}'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app)
        .put('/api/products/550e8400-e29b-41d4-a716-446655440001/adjust-stock')
        .send({ adjustment: -5 });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('5 units removed');
    });
  });

  describe('GET /api/products/inventory/low-stock', () => {
    it('should return products with low stock', async () => {
      const mockProducts = [
        { id: '1', name: 'Low Stock 1', slug: 'low-1', stock_quantity: 3, price: '10', image_urls: '[]', specifications: '{}' },
        { id: '2', name: 'Low Stock 2', slug: 'low-2', stock_quantity: 8, price: '20', image_urls: '[]', specifications: '{}' }
      ];

      pool.query.mockResolvedValueOnce({ rows: mockProducts });

      const res = await request(app).get('/api/products/inventory/low-stock?threshold=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.count).toBe(2);
      expect(res.body.threshold).toBe(10);
    });

    it('should use default threshold of 10', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/products/inventory/low-stock');

      expect(res.status).toBe(200);
      expect(res.body.threshold).toBe(10);
    });
  });

  describe('GET /api/products/inventory/stats', () => {
    it('should return inventory statistics', async () => {
      const mockStats = {
        total_products: '50',
        total_value: '5000',
        avg_price: '100',
        low_stock_count: '5'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockStats] });

      const res = await request(app).get('/api/products/inventory/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total_products).toBe(50);
      expect(res.body.data.low_stock_count).toBe(5);
    });
  });

  describe('POST /api/products/cart/validate', () => {
    it('should validate shopping cart', async () => {
      const mockProduct = {
        id: '550e8400-e29b-41d4-a716-446655440004',
        name: 'Test Beat',
        slug: 'test-beat',
        price: 29.99,
        stock_quantity: 10,
        image_urls: '[]'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app)
        .post('/api/products/cart/validate')
        .send({
          items: [
            { product_id: '550e8400-e29b-41d4-a716-446655440004', quantity: 2 }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pricing.total).toBe(59.98);
    });

    it('should reject invalid cart items', async () => {
      const res = await request(app)
        .post('/api/products/cart/validate')
        .send({
          items: [
            { product_id: 'invalid-uuid', quantity: 1 }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('POST /api/products/cart/summary', () => {
    it('should return cart summary', async () => {
      const mockProduct = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test Beat',
        slug: 'test-beat',
        price: 49.99,
        stock_quantity: 10,
        image_urls: '[]'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app)
        .post('/api/products/cart/summary')
        .send({
          items: [
            { product_id: '550e8400-e29b-41d4-a716-446655440001', quantity: 1 }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pricing.total).toBe(49.99);
    });
  });
});
