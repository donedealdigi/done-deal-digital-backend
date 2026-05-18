const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

class Product {
  /**
   * Create a new product
   * @param {Object} productData - { name, slug, description, category, price, stock_quantity, image_urls, specifications }
   * @returns {Object} Created product with id
   */
  static async create(productData) {
    const {
      name,
      slug,
      description,
      category,
      price,
      stock_quantity = 0,
      image_urls = [],
      specifications = {}
    } = productData;

    const id = uuidv4();
    const now = new Date();

    try {
      const result = await pool.query(
        `INSERT INTO products (id, name, slug, description, category, price, stock_quantity, image_urls, specifications, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [id, name, slug, description, category, price, stock_quantity, JSON.stringify(image_urls), JSON.stringify(specifications), now, now]
      );

      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error(`Product with slug "${slug}" already exists`);
      }
      throw error;
    }
  }

  /**
   * Find product by ID
   * @param {string} id - Product UUID
   * @returns {Object|null} Product object or null if not found
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT * FROM products WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    return this._formatProduct(result.rows[0]);
  }

  /**
   * Find product by slug
   * @param {string} slug - Product URL slug
   * @returns {Object|null} Product object or null if not found
   */
  static async findBySlug(slug) {
    const result = await pool.query(
      `SELECT * FROM products WHERE slug = $1`,
      [slug]
    );

    if (result.rows.length === 0) return null;

    return this._formatProduct(result.rows[0]);
  }

  /**
   * List all products with pagination and filtering
   * @param {Object} options - { page, limit, category, search, sortBy, sortOrder }
   * @returns {Object} { products: [], total, page, limit, pages }
   */
  static async findAll(options = {}) {
    const {
      page = 1,
      limit = 20,
      category = null,
      search = null,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    const sortByAllowed = ['created_at', 'updated_at', 'price', 'name'];
    const orderByField = sortByAllowed.includes(sortBy) ? sortBy : 'created_at';
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (category) {
      whereClause += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    if (search) {
      whereClause += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1} OR slug ILIKE $${params.length + 1})`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const result = await pool.query(
      `SELECT * FROM products ${whereClause} ORDER BY ${orderByField} ${orderDirection} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const products = result.rows.map(row => this._formatProduct(row));
    const pages = Math.ceil(total / limit);

    return {
      products,
      total,
      page,
      limit,
      pages
    };
  }

  /**
   * Find products by category
   * @param {string} category - Product category
   * @param {Object} options - { page, limit, sortBy, sortOrder }
   * @returns {Object} { products: [], total, page, limit, pages }
   */
  static async findByCategory(category, options = {}) {
    return this.findAll({ ...options, category });
  }

  /**
   * Search products
   * @param {string} query - Search query
   * @param {Object} options - { page, limit, sortBy, sortOrder }
   * @returns {Object} { products: [], total, page, limit, pages }
   */
  static async search(query, options = {}) {
    return this.findAll({ ...options, search: query });
  }

  /**
   * Update product
   * @param {string} id - Product UUID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated product or null if not found
   */
  static async update(id, updates) {
    const allowedFields = ['name', 'slug', 'description', 'category', 'price', 'stock_quantity', 'image_urls', 'specifications'];
    const updateFields = {};

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (['image_urls', 'specifications'].includes(key)) {
          updateFields[key] = JSON.stringify(value);
        } else {
          updateFields[key] = value;
        }
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return this.findById(id);
    }

    updateFields.updated_at = new Date();

    const setClause = Object.keys(updateFields)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = [id, ...Object.values(updateFields)];

    try {
      const result = await pool.query(
        `UPDATE products SET ${setClause} WHERE id = $1 RETURNING *`,
        values
      );

      if (result.rows.length === 0) return null;

      return this._formatProduct(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        throw new Error(`Product with that slug already exists`);
      }
      throw error;
    }
  }

  /**
   * Delete product
   * @param {string} id - Product UUID
   * @returns {boolean} True if deleted, false if not found
   */
  static async delete(id) {
    const result = await pool.query(
      `DELETE FROM products WHERE id = $1 RETURNING id`,
      [id]
    );

    return result.rows.length > 0;
  }

  /**
   * Update stock quantity
   * @param {string} id - Product UUID
   * @param {number} quantity - New quantity
   * @returns {Object|null} Updated product or null if not found
   */
  static async updateStock(id, quantity) {
    return this.update(id, { stock_quantity: quantity });
  }

  /**
   * Adjust stock (increment/decrement)
   * @param {string} id - Product UUID
   * @param {number} adjustment - Amount to adjust (can be negative)
   * @returns {Object|null} Updated product or null if not found
   */
  static async adjustStock(id, adjustment) {
    const result = await pool.query(
      `UPDATE products SET stock_quantity = stock_quantity + $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, adjustment]
    );

    if (result.rows.length === 0) return null;

    return this._formatProduct(result.rows[0]);
  }

  /**
   * Check if product has sufficient stock
   * @param {string} id - Product UUID
   * @param {number} quantity - Required quantity
   * @returns {boolean} True if stock available, false otherwise
   */
  static async hasStock(id, quantity) {
    const product = await this.findById(id);
    if (!product) return false;
    return product.stock_quantity >= quantity;
  }

  /**
   * Get low stock products (for inventory alerts)
   * @param {number} threshold - Stock level threshold
   * @returns {Array} Products below threshold
   */
  static async getLowStock(threshold = 10) {
    const result = await pool.query(
      `SELECT * FROM products WHERE stock_quantity < $1 ORDER BY stock_quantity ASC`,
      [threshold]
    );

    return result.rows.map(row => this._formatProduct(row));
  }

  /**
   * Get product statistics
   * @returns {Object} { total_products, total_value, avg_price, low_stock_count }
   */
  static async getStats() {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_products,
        COALESCE(SUM(price * stock_quantity), 0) as total_value,
        COALESCE(AVG(price), 0) as avg_price,
        COUNT(CASE WHEN stock_quantity < 10 THEN 1 END) as low_stock_count
       FROM products`
    );

    const row = result.rows[0];
    return {
      total_products: parseInt(row.total_products, 10),
      total_value: parseFloat(row.total_value),
      avg_price: parseFloat(row.avg_price),
      low_stock_count: parseInt(row.low_stock_count, 10)
    };
  }

  /**
   * Format product row (parse JSON fields)
   * @private
   */
  static _formatProduct(row) {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      category: row.category,
      price: parseFloat(row.price),
      stock_quantity: row.stock_quantity,
      image_urls: Array.isArray(row.image_urls) ? row.image_urls : JSON.parse(row.image_urls || '[]'),
      specifications: typeof row.specifications === 'string' ? JSON.parse(row.specifications) : (row.specifications || {}),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

module.exports = Product;
