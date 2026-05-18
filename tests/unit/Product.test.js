const Product = require('../../src/models/Product');
const pool = require('../../src/config/database');

// Mock the database pool
jest.mock('../../src/config/database');

describe('Product Model', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new product with all fields', async () => {
      const mockProduct = {
        id: 'test-id-123',
        name: 'Test Beat',
        slug: 'test-beat',
        description: 'A test beat',
        category: 'hip-hop',
        price: 49.99,
        stock_quantity: 10,
        image_urls: ['https://example.com/image.jpg'],
        specifications: { bpm: 90, key: 'C minor' },
        created_at: new Date(),
        updated_at: new Date()
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockProduct]
      });

      const result = await Product.create({
        name: 'Test Beat',
        slug: 'test-beat',
        description: 'A test beat',
        category: 'hip-hop',
        price: 49.99,
        stock_quantity: 10,
        image_urls: ['https://example.com/image.jpg'],
        specifications: { bpm: 90, key: 'C minor' }
      });

      expect(result).toEqual(mockProduct);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO products'),
        expect.any(Array)
      );
    });

    it('should throw error if slug already exists (unique constraint)', async () => {
      const error = new Error('duplicate key');
      error.code = '23505';
      pool.query.mockRejectedValueOnce(error);

      await expect(
        Product.create({
          name: 'Test',
          slug: 'existing-slug',
          price: 29.99
        })
      ).rejects.toThrow('already exists');
    });

    it('should use default values for optional fields', async () => {
      const mockProduct = {
        id: 'test-id',
        name: 'Minimal Product',
        slug: 'minimal-product',
        description: '',
        category: 'general',
        price: 19.99,
        stock_quantity: 0,
        image_urls: [],
        specifications: {},
        created_at: new Date(),
        updated_at: new Date()
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockProduct]
      });

      const result = await Product.create({
        name: 'Minimal Product',
        slug: 'minimal-product',
        price: 19.99
      });

      expect(result.stock_quantity).toBe(0);
      expect(result.image_urls).toEqual([]);
      expect(result.specifications).toEqual({});
    });
  });

  describe('findById', () => {
    it('should return product by ID', async () => {
      const mockProduct = {
        id: 'uuid-123',
        name: 'Test Product',
        slug: 'test-product',
        description: 'A test product',
        category: 'merch',
        price: '39.99',
        stock_quantity: 5,
        image_urls: '[]',
        specifications: '{}',
        created_at: new Date(),
        updated_at: new Date()
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockProduct]
      });

      const result = await Product.findById('uuid-123');

      expect(result).toHaveProperty('id', 'uuid-123');
      expect(result.price).toBe(39.99);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM products WHERE id'),
        ['uuid-123']
      );
    });

    it('should return null if product not found', async () => {
      pool.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await Product.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should return product by slug', async () => {
      const mockProduct = {
        id: 'uuid-123',
        name: 'Test Product',
        slug: 'test-product',
        price: '29.99',
        stock_quantity: 3,
        image_urls: '[]',
        specifications: '{}',
        created_at: new Date(),
        updated_at: new Date()
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockProduct]
      });

      const result = await Product.findBySlug('test-product');

      expect(result.slug).toBe('test-product');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE slug'),
        ['test-product']
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated products with default options', async () => {
      const mockProducts = [
        { id: '1', name: 'Product 1', slug: 'prod-1', price: '10', stock_quantity: 5, image_urls: '[]', specifications: '{}' },
        { id: '2', name: 'Product 2', slug: 'prod-2', price: '20', stock_quantity: 10, image_urls: '[]', specifications: '{}' }
      ];

      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: mockProducts });

      const result = await Product.findAll({ page: 1, limit: 20 });

      expect(result.products).toHaveLength(2);
      expect(result.total).toBe(100);
      expect(result.page).toBe(1);
      expect(result.pages).toBe(5);
    });

    it('should filter by category', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '15' }] })
        .mockResolvedValueOnce({ rows: [] });

      await Product.findAll({ category: 'hip-hop', page: 1, limit: 20 });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE 1=1 AND category'),
        expect.arrayContaining(['hip-hop'])
      );
    });

    it('should search by query', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await Product.findAll({ search: 'beat', page: 1, limit: 20 });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%beat%'])
      );
    });

    it('should handle sorting by allowed fields', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await Product.findAll({ sortBy: 'price', sortOrder: 'ASC', page: 1, limit: 20 });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY price ASC'),
        expect.any(Array)
      );
    });

    it('should ignore invalid sortBy fields', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await Product.findAll({ sortBy: 'invalid_field', page: 1, limit: 20 });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at'),
        expect.any(Array)
      );
    });
  });

  describe('update', () => {
    it('should update product fields', async () => {
      const mockProduct = {
        id: 'uuid-123',
        name: 'Updated Product',
        slug: 'updated-product',
        price: '49.99',
        stock_quantity: 20,
        image_urls: '[]',
        specifications: '{}',
        updated_at: new Date()
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockProduct]
      });

      const result = await Product.update('uuid-123', {
        name: 'Updated Product',
        price: 49.99,
        stock_quantity: 20
      });

      expect(result.name).toBe('Updated Product');
      expect(result.price).toBe(49.99);
    });

    it('should only update allowed fields', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{}] });

      await Product.update('uuid-123', {
        name: 'New Name',
        admin_notes: 'should be ignored',
        dangerous_field: 'also ignored'
      });

      const callArgs = pool.query.mock.calls[0][0];
      expect(callArgs).toContain('name');
      expect(callArgs).not.toContain('admin_notes');
      expect(callArgs).not.toContain('dangerous_field');
    });

    it('should return null if product not found', async () => {
      pool.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await Product.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete product and return true', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'uuid-123' }]
      });

      const result = await Product.delete('uuid-123');

      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM products'),
        ['uuid-123']
      );
    });

    it('should return false if product not found', async () => {
      pool.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await Product.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('stock management', () => {
    it('updateStock should set stock to exact quantity', async () => {
      const mockProduct = {
        id: 'uuid-123',
        stock_quantity: 50,
        image_urls: '[]',
        specifications: '{}'
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockProduct]
      });

      const result = await Product.updateStock('uuid-123', 50);

      expect(result.stock_quantity).toBe(50);
    });

    it('adjustStock should increment/decrement stock', async () => {
      const mockProduct = {
        id: 'uuid-123',
        stock_quantity: 35,
        image_urls: '[]',
        specifications: '{}'
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockProduct]
      });

      const result = await Product.adjustStock('uuid-123', 10);

      expect(result.stock_quantity).toBe(35);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('stock_quantity = stock_quantity + $2'),
        ['uuid-123', 10]
      );
    });

    it('adjustStock should handle negative adjustments', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'uuid-123', stock_quantity: 5, image_urls: '[]', specifications: '{}' }]
      });

      await Product.adjustStock('uuid-123', -5);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('stock_quantity = stock_quantity + $2'),
        ['uuid-123', -5]
      );
    });

    it('hasStock should return true if stock available', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'uuid-123', stock_quantity: 10, image_urls: '[]', specifications: '{}' }]
      });

      const result = await Product.hasStock('uuid-123', 5);

      expect(result).toBe(true);
    });

    it('hasStock should return false if insufficient stock', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'uuid-123', stock_quantity: 3, image_urls: '[]', specifications: '{}' }]
      });

      const result = await Product.hasStock('uuid-123', 5);

      expect(result).toBe(false);
    });
  });

  describe('getLowStock', () => {
    it('should return products below threshold', async () => {
      const mockProducts = [
        { id: '1', name: 'Low Stock 1', slug: 'low-1', stock_quantity: 3, price: '10', image_urls: '[]', specifications: '{}' },
        { id: '2', name: 'Low Stock 2', slug: 'low-2', stock_quantity: 8, price: '20', image_urls: '[]', specifications: '{}' }
      ];

      pool.query.mockResolvedValueOnce({
        rows: mockProducts
      });

      const result = await Product.getLowStock(10);

      expect(result).toHaveLength(2);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE stock_quantity < $1'),
        [10]
      );
    });

    it('should use default threshold of 10', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await Product.getLowStock();

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [10]
      );
    });
  });

  describe('getStats', () => {
    it('should return inventory statistics', async () => {
      const mockStats = {
        total_products: '50',
        total_value: '5000',
        avg_price: '100',
        low_stock_count: '5'
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockStats]
      });

      const result = await Product.getStats();

      expect(result.total_products).toBe(50);
      expect(result.total_value).toBe(5000);
      expect(result.avg_price).toBe(100);
      expect(result.low_stock_count).toBe(5);
    });
  });

  describe('_formatProduct', () => {
    it('should parse JSONB fields correctly', () => {
      const dbRow = {
        id: 'uuid-123',
        name: 'Test Product',
        slug: 'test-product',
        description: 'A test product',
        category: 'merch',
        price: '39.99',
        stock_quantity: 10,
        image_urls: '["https://example.com/img1.jpg", "https://example.com/img2.jpg"]',
        specifications: '{"color": "red", "size": "medium"}',
        created_at: new Date(),
        updated_at: new Date()
      };

      const result = Product._formatProduct(dbRow);

      expect(result.price).toBe(39.99);
      expect(Array.isArray(result.image_urls)).toBe(true);
      expect(result.image_urls).toEqual(['https://example.com/img1.jpg', 'https://example.com/img2.jpg']);
      expect(result.specifications).toEqual({ color: 'red', size: 'medium' });
    });

    it('should handle already-parsed JSONB fields', () => {
      const dbRow = {
        id: 'uuid-123',
        name: 'Test Product',
        slug: 'test-product',
        price: '19.99',
        stock_quantity: 5,
        image_urls: ['https://example.com/image.jpg'],
        specifications: { color: 'blue' },
        created_at: new Date(),
        updated_at: new Date()
      };

      const result = Product._formatProduct(dbRow);

      expect(result.image_urls).toEqual(['https://example.com/image.jpg']);
      expect(result.specifications).toEqual({ color: 'blue' });
    });
  });
});
