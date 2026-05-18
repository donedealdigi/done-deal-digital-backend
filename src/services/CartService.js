const Product = require('../models/Product');

/**
 * Shopping Cart Service
 * Handles cart operations: add, remove, update, calculate totals
 * Cart is stored in session/client (stateless), validated on checkout
 */
class CartService {
  /**
   * Validate cart items against current database state
   * Ensures all items exist, prices are current, and stock is available
   * @param {Array} cartItems - Array of { product_id, quantity }
   * @returns {Object} { valid: boolean, items: [], total: number, errors: [] }
   */
  static async validateCart(cartItems) {
    const errors = [];
    const validItems = [];
    let total = 0;

    for (const item of cartItems) {
      const { product_id, quantity } = item;

      if (!product_id || !quantity) {
        errors.push(`Invalid cart item: missing product_id or quantity`);
        continue;
      }

      if (quantity < 1) {
        errors.push(`Invalid quantity for product ${product_id}: must be at least 1`);
        continue;
      }

      // Check if product exists
      const product = await Product.findById(product_id);
      if (!product) {
        errors.push(`Product ${product_id} not found`);
        continue;
      }

      // Check stock availability
      if (product.stock_quantity < quantity) {
        errors.push(`Product "${product.name}": only ${product.stock_quantity} in stock (requested ${quantity})`);
        continue;
      }

      // Add to valid items with current product data
      validItems.push({
        product_id: product.id,
        product_name: product.name,
        slug: product.slug,
        quantity,
        unit_price: product.price,
        line_total: product.price * quantity,
        image_url: product.image_urls && product.image_urls[0] ? product.image_urls[0] : null
      });

      total += product.price * quantity;
    }

    return {
      valid: errors.length === 0,
      items: validItems,
      total: parseFloat(total.toFixed(2)),
      errors
    };
  }

  /**
   * Calculate cart totals
   * @param {Array} validItems - Pre-validated cart items with line_total
   * @param {Object} discounts - { coupon_code?, discount_amount?, discount_percent? }
   * @param {Object} shipping - { cost: number }
   * @param {Object} tax - { rate: number, amount?: number }
   * @returns {Object} Complete pricing breakdown
   */
  static calculateTotals(validItems, discounts = {}, shipping = {}, tax = {}) {
    const subtotal = validItems.reduce((sum, item) => sum + item.line_total, 0);

    let discountAmount = 0;
    if (discounts.discount_amount) {
      discountAmount = Math.min(discounts.discount_amount, subtotal); // Don't exceed subtotal
    } else if (discounts.discount_percent) {
      discountAmount = subtotal * (discounts.discount_percent / 100);
    }

    const subtotalAfterDiscount = subtotal - discountAmount;
    const shippingCost = shipping.cost || 0;

    // Calculate tax (usually on subtotal + shipping, depends on jurisdiction)
    let taxAmount = 0;
    if (tax.rate) {
      taxAmount = (subtotalAfterDiscount + shippingCost) * (tax.rate / 100);
    } else if (tax.amount) {
      taxAmount = tax.amount;
    }

    const total = subtotalAfterDiscount + shippingCost + taxAmount;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount: parseFloat(discountAmount.toFixed(2)),
      subtotal_after_discount: parseFloat(subtotalAfterDiscount.toFixed(2)),
      shipping: parseFloat(shippingCost.toFixed(2)),
      tax: parseFloat(taxAmount.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      item_count: validItems.length,
      quantity_count: validItems.reduce((sum, item) => sum + item.quantity, 0)
    };
  }

  /**
   * Format cart for response (human-readable)
   * @param {Object} validatedCart - Output from validateCart()
   * @param {Object} totals - Output from calculateTotals()
   * @returns {Object} Formatted cart ready for API response
   */
  static formatCartResponse(validatedCart, totals) {
    return {
      items: validatedCart.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        slug: item.slug,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        image_url: item.image_url
      })),
      pricing: totals,
      valid: validatedCart.valid,
      errors: validatedCart.errors
    };
  }

  /**
   * Validate a single item add to cart
   * @param {string} productId
   * @param {number} quantity
   * @returns {Object} { valid: boolean, product: Object, error?: string }
   */
  static async validateItemAdd(productId, quantity) {
    if (!productId) {
      return { valid: false, error: 'product_id is required' };
    }

    if (!quantity || quantity < 1) {
      return { valid: false, error: 'quantity must be at least 1' };
    }

    const product = await Product.findById(productId);
    if (!product) {
      return { valid: false, error: `Product not found` };
    }

    if (product.stock_quantity < quantity) {
      return {
        valid: false,
        error: `Insufficient stock: ${product.stock_quantity} available, ${quantity} requested`,
        available: product.stock_quantity
      };
    }

    return {
      valid: true,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        available: product.stock_quantity
      }
    };
  }

  /**
   * Get cart summary for display
   * @param {Array} cartItems - Array of { product_id, quantity }
   * @returns {Object} Cart summary with products and totals
   */
  static async getCartSummary(cartItems) {
    const validated = await this.validateCart(cartItems);
    const totals = this.calculateTotals(validated.items);
    return this.formatCartResponse(validated, totals);
  }

  /**
   * Merge duplicate items in cart
   * @param {Array} cartItems - Array of { product_id, quantity }
   * @returns {Array} Deduplicated items with combined quantities
   */
  static mergeCartItems(cartItems) {
    const merged = {};

    for (const item of cartItems) {
      if (merged[item.product_id]) {
        merged[item.product_id].quantity += item.quantity;
      } else {
        merged[item.product_id] = { ...item };
      }
    }

    return Object.values(merged);
  }
}

module.exports = CartService;
