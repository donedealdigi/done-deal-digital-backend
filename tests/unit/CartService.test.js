const CartService = require('../../src/services/CartService');
const Product = require('../../src/models/Product');

// Mock the Product model
jest.mock('../../src/models/Product');

describe('CartService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCart', () => {
    it('should validate cart with valid items', async () => {
      const mockProduct = {
        id: 'product-123',
        name: 'Test Beat',
        slug: 'test-beat',
        price: 29.99,
        stock_quantity: 10,
        image_urls: ['https://example.com/image.jpg']
      };

      Product.findById.mockResolvedValueOnce(mockProduct);

      const result = await CartService.validateCart([
        { product_id: 'product-123', quantity: 2 }
      ]);

      expect(result.valid).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].product_name).toBe('Test Beat');
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].line_total).toBe(59.98);
      expect(result.total).toBe(59.98);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject cart with missing product_id', async () => {
      const result = await CartService.validateCart([
        { quantity: 2 }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('missing product_id'));
    });

    it('should reject cart with invalid quantity', async () => {
      const result = await CartService.validateCart([
        { product_id: 'product-123', quantity: 0 }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('quantity'));
    });

    it('should reject item if product not found', async () => {
      Product.findById.mockResolvedValueOnce(null);

      const result = await CartService.validateCart([
        { product_id: 'non-existent', quantity: 1 }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('not found'));
    });

    it('should reject item if stock insufficient', async () => {
      const mockProduct = {
        id: 'product-123',
        name: 'Limited Beat',
        slug: 'limited-beat',
        price: 49.99,
        stock_quantity: 2,
        image_urls: []
      };

      Product.findById.mockResolvedValueOnce(mockProduct);

      const result = await CartService.validateCart([
        { product_id: 'product-123', quantity: 5 }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('only 2 in stock'));
    });

    it('should handle multiple items with mixed validity', async () => {
      const mockProduct1 = {
        id: 'product-1',
        name: 'Available Beat',
        slug: 'available-beat',
        price: 29.99,
        stock_quantity: 10,
        image_urls: []
      };

      Product.findById
        .mockResolvedValueOnce(mockProduct1)
        .mockResolvedValueOnce(null); // Second product not found

      const result = await CartService.validateCart([
        { product_id: 'product-1', quantity: 2 },
        { product_id: 'product-2', quantity: 1 }
      ]);

      expect(result.valid).toBe(false);
      expect(result.items).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should use first image URL if available', async () => {
      const mockProduct = {
        id: 'product-123',
        name: 'Beat with Image',
        slug: 'beat-image',
        price: 39.99,
        stock_quantity: 5,
        image_urls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg']
      };

      Product.findById.mockResolvedValueOnce(mockProduct);

      const result = await CartService.validateCart([
        { product_id: 'product-123', quantity: 1 }
      ]);

      expect(result.items[0].image_url).toBe('https://example.com/img1.jpg');
    });

    it('should handle null image_urls', async () => {
      const mockProduct = {
        id: 'product-123',
        name: 'Beat without Images',
        slug: 'beat-no-image',
        price: 19.99,
        stock_quantity: 10,
        image_urls: null
      };

      Product.findById.mockResolvedValueOnce(mockProduct);

      const result = await CartService.validateCart([
        { product_id: 'product-123', quantity: 1 }
      ]);

      expect(result.items[0].image_url).toBeNull();
    });
  });

  describe('calculateTotals', () => {
    const mockItems = [
      { product_id: '1', quantity: 2, unit_price: 50, line_total: 100 },
      { product_id: '2', quantity: 1, unit_price: 75, line_total: 75 }
    ];

    it('should calculate totals without discounts, shipping, or tax', () => {
      const result = CartService.calculateTotals(mockItems);

      expect(result.subtotal).toBe(175);
      expect(result.discount).toBe(0);
      expect(result.subtotal_after_discount).toBe(175);
      expect(result.shipping).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.total).toBe(175);
      expect(result.item_count).toBe(2);
      expect(result.quantity_count).toBe(3);
    });

    it('should apply fixed discount amount', () => {
      const result = CartService.calculateTotals(
        mockItems,
        { discount_amount: 25 }
      );

      expect(result.subtotal).toBe(175);
      expect(result.discount).toBe(25);
      expect(result.subtotal_after_discount).toBe(150);
      expect(result.total).toBe(150);
    });

    it('should apply percentage discount', () => {
      const result = CartService.calculateTotals(
        mockItems,
        { discount_percent: 10 }
      );

      expect(result.subtotal).toBe(175);
      expect(result.discount).toBe(17.5);
      expect(result.subtotal_after_discount).toBe(157.5);
      expect(result.total).toBe(157.5);
    });

    it('should not allow discount to exceed subtotal', () => {
      const result = CartService.calculateTotals(
        mockItems,
        { discount_amount: 500 }
      );

      expect(result.discount).toBe(175);
      expect(result.subtotal_after_discount).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should add shipping cost', () => {
      const result = CartService.calculateTotals(
        mockItems,
        {},
        { cost: 15.99 }
      );

      expect(result.shipping).toBe(15.99);
      expect(result.total).toBe(190.99);
    });

    it('should calculate tax as percentage', () => {
      const result = CartService.calculateTotals(
        mockItems,
        {},
        {},
        { rate: 8.5 }
      );

      expect(result.tax).toBeCloseTo(14.88, 1);
      expect(result.total).toBeCloseTo(189.88, 1);
    });

    it('should use fixed tax amount if provided', () => {
      const result = CartService.calculateTotals(
        mockItems,
        {},
        {},
        { amount: 20 }
      );

      expect(result.tax).toBe(20);
      expect(result.total).toBe(195);
    });

    it('should calculate complex totals with all parameters', () => {
      const result = CartService.calculateTotals(
        mockItems,
        { discount_percent: 10 },
        { cost: 10 },
        { rate: 8.875 }
      );

      expect(result.subtotal).toBe(175);
      expect(result.discount).toBe(17.5);
      expect(result.subtotal_after_discount).toBe(157.5);
      expect(result.shipping).toBe(10);
      const taxableAmount = 157.5 + 10;
      expect(result.tax).toBeCloseTo(taxableAmount * 0.08875, 1);
      expect(result.total).toBeCloseTo(157.5 + 10 + (taxableAmount * 0.08875), 1);
    });

    it('should format all values to 2 decimal places', () => {
      const items = [
        { product_id: '1', quantity: 1, unit_price: 10.555, line_total: 10.555 },
        { product_id: '2', quantity: 1, unit_price: 20.999, line_total: 20.999 }
      ];

      const result = CartService.calculateTotals(items);

      expect(result.subtotal.toString()).toMatch(/^\d+\.\d{2}$/);
      expect(result.total.toString()).toMatch(/^\d+\.\d{2}$/);
    });
  });

  describe('formatCartResponse', () => {
    it('should format cart response correctly', () => {
      const validatedCart = {
        valid: true,
        items: [
          {
            product_id: '1',
            product_name: 'Beat 1',
            slug: 'beat-1',
            quantity: 2,
            unit_price: 50,
            line_total: 100,
            image_url: 'https://example.com/img1.jpg'
          }
        ],
        errors: []
      };

      const totals = {
        subtotal: 100,
        discount: 0,
        subtotal_after_discount: 100,
        shipping: 10,
        tax: 8.75,
        total: 118.75,
        item_count: 1,
        quantity_count: 2
      };

      const result = CartService.formatCartResponse(validatedCart, totals);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('pricing');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result.items).toHaveLength(1);
      expect(result.pricing).toEqual(totals);
      expect(result.valid).toBe(true);
    });

    it('should include errors in response', () => {
      const validatedCart = {
        valid: false,
        items: [],
        errors: ['Product not found']
      };

      const totals = {
        subtotal: 0,
        discount: 0,
        subtotal_after_discount: 0,
        shipping: 0,
        tax: 0,
        total: 0,
        item_count: 0,
        quantity_count: 0
      };

      const result = CartService.formatCartResponse(validatedCart, totals);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Product not found');
    });
  });

  describe('validateItemAdd', () => {
    it('should validate single item add', async () => {
      const mockProduct = {
        id: 'product-123',
        name: 'Test Beat',
        slug: 'test-beat',
        price: 29.99,
        stock_quantity: 5
      };

      Product.findById.mockResolvedValueOnce(mockProduct);

      const result = await CartService.validateItemAdd('product-123', 2);

      expect(result.valid).toBe(true);
      expect(result.product.id).toBe('product-123');
      expect(result.product.price).toBe(29.99);
      expect(result.product.available).toBe(5);
    });

    it('should reject if product_id missing', async () => {
      const result = await CartService.validateItemAdd(null, 1);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('product_id');
    });

    it('should reject if quantity invalid', async () => {
      const result = await CartService.validateItemAdd('product-123', 0);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('quantity');
    });

    it('should reject if product not found', async () => {
      Product.findById.mockResolvedValueOnce(null);

      const result = await CartService.validateItemAdd('non-existent', 1);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject if insufficient stock', async () => {
      const mockProduct = {
        id: 'product-123',
        name: 'Limited Beat',
        slug: 'limited-beat',
        price: 49.99,
        stock_quantity: 2
      };

      Product.findById.mockResolvedValueOnce(mockProduct);

      const result = await CartService.validateItemAdd('product-123', 5);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient stock');
      expect(result.available).toBe(2);
    });
  });

  describe('getCartSummary', () => {
    it('should return complete cart summary', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Test Beat',
        slug: 'test-beat',
        price: 49.99,
        stock_quantity: 10,
        image_urls: []
      };

      Product.findById.mockResolvedValueOnce(mockProduct);

      const result = await CartService.getCartSummary([
        { product_id: 'product-1', quantity: 1 }
      ]);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('pricing');
      expect(result).toHaveProperty('valid');
      expect(result.pricing.total).toBe(49.99);
    });
  });

  describe('mergeCartItems', () => {
    it('should merge duplicate product IDs with combined quantities', () => {
      const cartItems = [
        { product_id: 'prod-1', quantity: 2 },
        { product_id: 'prod-2', quantity: 1 },
        { product_id: 'prod-1', quantity: 3 }
      ];

      const result = CartService.mergeCartItems(cartItems);

      expect(result).toHaveLength(2);
      const prod1 = result.find(item => item.product_id === 'prod-1');
      expect(prod1.quantity).toBe(5);
    });

    it('should preserve non-duplicate items', () => {
      const cartItems = [
        { product_id: 'prod-1', quantity: 2 },
        { product_id: 'prod-2', quantity: 1 }
      ];

      const result = CartService.mergeCartItems(cartItems);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', () => {
      const result = CartService.mergeCartItems([]);

      expect(result).toEqual([]);
    });

    it('should handle single item cart', () => {
      const cartItems = [{ product_id: 'prod-1', quantity: 5 }];

      const result = CartService.mergeCartItems(cartItems);

      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(5);
    });
  });
});
