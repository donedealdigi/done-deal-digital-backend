const express = require('express');
const { query, body, param, validationResult } = require('express-validator');
const Product = require('../models/Product');
const CartService = require('../services/CartService');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/products
 * List all products with pagination, filtering, and sorting
 * Query params: page, limit, category, search, sortBy, sortOrder
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('category').optional().trim(),
  query('search').optional().trim(),
  query('sortBy').optional().isIn(['created_at', 'updated_at', 'price', 'name']),
  query('sortOrder').optional().isIn(['ASC', 'DESC'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const result = await Product.findAll({
      page: req.query.page || 1,
      limit: req.query.limit || 20,
      category: req.query.category || null,
      search: req.query.search || null,
      sortBy: req.query.sortBy || 'created_at',
      sortOrder: req.query.sortOrder || 'DESC'
    });

    res.json({
      success: true,
      data: result.products,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/category/:category
 * Get products by category
 */
router.get('/category/:category', [
  param('category').trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], async (req, res, next) => {
  try {
    const result = await Product.findByCategory(req.params.category, {
      page: req.query.page || 1,
      limit: req.query.limit || 20
    });

    res.json({
      success: true,
      data: result.products,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/search/:query
 * Search products by name, description, slug
 */
router.get('/search/:query', [
  param('query').trim().isLength({ min: 1 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], async (req, res, next) => {
  try {
    const result = await Product.search(req.params.query, {
      page: req.query.page || 1,
      limit: req.query.limit || 20
    });

    res.json({
      success: true,
      data: result.products,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/inventory/low-stock
 * Get products with low stock (admin only)
 */
router.get('/inventory/low-stock', [
  authenticate,
  authorize(['admin']),
  query('threshold').optional().isInt({ min: 1 }).toInt()
], async (req, res, next) => {
  try {
    const threshold = req.query.threshold || 10;
    const products = await Product.getLowStock(threshold);

    res.json({
      success: true,
      data: products,
      threshold,
      count: products.length,
      message: `${products.length} products below ${threshold} units`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/inventory/stats
 * Get product inventory statistics (admin only)
 */
router.get('/inventory/stats', [
  authenticate,
  authorize(['admin'])
], async (req, res, next) => {
  try {
    const stats = await Product.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/:id
 * Get single product by ID
 */
router.get('/:id', [
  param('id').isUUID()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/products
 * Create new product (admin only)
 */
router.post('/', [
  authenticate,
  authorize(['admin']),
  body('name').trim().isLength({ min: 1, max: 255 }),
  body('slug').trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim(),
  body('category').optional().trim().isLength({ max: 100 }),
  body('price').isFloat({ min: 0 }),
  body('stock_quantity').optional().isInt({ min: 0 }).toInt(),
  body('image_urls').optional().isArray(),
  body('specifications').optional().isObject()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.create({
      name: req.body.name,
      slug: req.body.slug,
      description: req.body.description || '',
      category: req.body.category || 'general',
      price: parseFloat(req.body.price),
      stock_quantity: req.body.stock_quantity || 0,
      image_urls: req.body.image_urls || [],
      specifications: req.body.specifications || {}
    });

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    if (error.message.includes('already exists')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * PUT /api/products/:id
 * Update product (admin only)
 */
router.put('/:id', [
  authenticate,
  authorize(['admin']),
  param('id').isUUID(),
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('slug').optional().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim(),
  body('category').optional().trim().isLength({ max: 100 }),
  body('price').optional().isFloat({ min: 0 }),
  body('stock_quantity').optional().isInt({ min: 0 }).toInt(),
  body('image_urls').optional().isArray(),
  body('specifications').optional().isObject()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.update(req.params.id, req.body);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    if (error.message.includes('already exists')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * DELETE /api/products/:id
 * Delete product (admin only)
 */
router.delete('/:id', [
  authenticate,
  authorize(['admin']),
  param('id').isUUID()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const deleted = await Product.delete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/products/:id/stock
 * Update product stock (admin only)
 */
router.put('/:id/stock', [
  authenticate,
  authorize(['admin']),
  param('id').isUUID(),
  body('quantity').isInt({ min: 0 }).toInt()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.updateStock(req.params.id, req.body.quantity);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({
      success: true,
      data: product,
      message: `Stock updated to ${req.body.quantity}`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/products/:id/adjust-stock
 * Adjust product stock by amount (admin only)
 */
router.put('/:id/adjust-stock', [
  authenticate,
  authorize(['admin']),
  param('id').isUUID(),
  body('adjustment').isInt()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.adjustStock(req.params.id, req.body.adjustment);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const action = req.body.adjustment > 0 ? 'added' : 'removed';
    res.json({
      success: true,
      data: product,
      message: `${Math.abs(req.body.adjustment)} units ${action}, new stock: ${product.stock_quantity}`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/products/cart/validate
 * Validate a shopping cart
 */
router.post('/cart/validate', [
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isUUID(),
  body('items.*.quantity').isInt({ min: 1 }).toInt()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const validated = await CartService.validateCart(req.body.items);
    const totals = CartService.calculateTotals(validated.items);
    const cart = CartService.formatCartResponse(validated, totals);

    res.json({
      success: validated.valid,
      data: cart
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/products/cart/summary
 * Get cart summary
 */
router.post('/cart/summary', [
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isUUID(),
  body('items.*.quantity').isInt({ min: 1 }).toInt()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const summary = await CartService.getCartSummary(req.body.items);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
