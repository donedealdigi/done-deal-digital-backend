const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/orders
 * Get user's orders with pagination
 * Query params: limit (default 50), offset (default 0)
 * Returns: array of orders
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Validate pagination parameters
    if (limit < 1 || offset < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters'
      });
    }

    // Fetch user's orders
    const orders = await Order.findByUserId(userId, limit, offset);

    // Convert total_price to number for each order
    const formattedOrders = orders.map(order => ({
      ...order,
      total_price: parseFloat(order.total_price)
    }));

    res.status(200).json({
      success: true,
      data: {
        orders: formattedOrders,
        pagination: {
          limit,
          offset,
          count: formattedOrders.length
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user orders:', error.message);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/orders/:id
 * Get a specific order by ID
 * Returns: order details with payment status
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    // Fetch order
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Verify user owns this order
    if (order.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to this order'
      });
    }

    // Convert total_price to number
    const formattedOrder = {
      ...order,
      total_price: parseFloat(order.total_price)
    };

    res.status(200).json({
      success: true,
      data: formattedOrder
    });
  } catch (error) {
    console.error('❌ Error fetching order:', error.message);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch order',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/orders
 * Create a new order
 * Body: {
 *   totalPrice (required): number,
 *   items (optional): array,
 *   metadata (optional): object
 * }
 * Returns: created order with order_number and status
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { totalPrice, items = [], metadata = {} } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (totalPrice === undefined || totalPrice === null) {
      return res.status(400).json({
        success: false,
        error: 'totalPrice is required'
      });
    }

    // Validate totalPrice is a positive number
    if (typeof totalPrice !== 'number' || totalPrice <= 0) {
      return res.status(400).json({
        success: false,
        error: 'totalPrice must be a positive number'
      });
    }

    // Create the order
    const order = await Order.create({
      userId,
      totalPrice,
      status: 'pending',
      items,
      metadata
    });

    res.status(201).json({
      success: true,
      data: {
        id: order.id,
        orderId: order.id,
        orderNumber: order.order_number,
        userId: order.user_id,
        totalPrice: parseFloat(order.total_price),
        status: order.status,
        paymentStatus: order.payment_status || 'pending',
        items: order.items,
        metadata: order.metadata,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Error creating order:', error.message);

    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
