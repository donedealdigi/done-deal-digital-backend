const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const stripeConfig = require('../config/stripe');
const PaymentService = require('../services/PaymentService');
const PayPalService = require('../services/PayPalService');
const { authenticate } = require('../middleware/auth');
const { validatePaymentInput, validateRefundInput } = require('../middleware/validation');

/**
 * Convert a string to UUID format (for development mode)
 * If already a UUID, returns as-is
 */
function stringToUUID(str) {
  // Check if already a valid UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return str;
  }
  // Hash the string to create a consistent UUID
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-${hash.substr(12, 4)}-${hash.substr(16, 4)}-${hash.substr(20, 12)}`;
}

/**
 * POST /api/payments/create-intent
 * Create a Stripe payment intent for an order
 * Requires: orderId in body
 * Returns: clientSecret and paymentIntentId for client-side payment
 */
router.post('/create-intent', validatePaymentInput, async (req, res) => {
  try {
    let { orderId } = req.body;
    // In development, convert orderId to UUID format and use test userId
    if (process.env.NODE_ENV === 'development') {
      orderId = stringToUUID(orderId);
    }
    const userId = process.env.NODE_ENV === 'development' ? '11111111-1111-1111-1111-111111111111' : req.user?.id;

    if (!userId && process.env.NODE_ENV !== 'development') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - authentication required'
      });
    }

    // Create payment intent via PaymentService
    const result = await PaymentService.createPaymentIntent(orderId, userId);

    res.status(200).json({
      success: true,
      data: {
        paymentIntentId: result.paymentIntentId,
        clientSecret: result.clientSecret,
        amount: result.amount,
        currency: result.currency,
        status: result.status
      }
    });
  } catch (error) {
    console.error('❌ Error creating payment intent:', error.message);

    // Handle specific error cases
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to this order'
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Stripe API errors
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create payment intent',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/payments/confirm
 * Confirm a payment intent with payment method
 * Requires: paymentIntentId and paymentMethodId in body
 * Returns: payment confirmation status
 */
router.post('/confirm', async (req, res) => {
  try {
    const { paymentIntentId, paymentMethodId } = req.body;

    if (!paymentIntentId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: paymentIntentId and paymentMethodId'
      });
    }

    // Confirm payment via PaymentService
    const result = await PaymentService.confirmPayment(paymentIntentId, paymentMethodId);

    res.status(200).json({
      success: result.success,
      data: {
        status: result.status,
        paymentId: result.paymentId,
        orderId: result.orderId,
        chargeId: result.chargeId
      }
    });
  } catch (error) {
    console.error('❌ Error confirming payment:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Payment intent or order not found'
      });
    }

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to confirm payment',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/payments/status/:paymentIntentId
 * Get the status of a payment intent
 * Returns: current payment status and details
 */
router.get('/status/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment intent ID is required'
      });
    }

    // Get payment status via PaymentService
    const status = await PaymentService.getPaymentStatus(paymentIntentId);

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ Error getting payment status:', error.message);

    if (error.message.includes('not found') || error.message.includes('No such')) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to get payment status',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 * Signature verification required
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    let event;

    // Verify and construct event from Stripe
    try {
      event = stripeConfig.stripe.webhooks.constructEvent(
        req.body,
        sig,
        stripeConfig.webhookSecret
      );
    } catch (err) {
      console.error('⚠️  Webhook signature verification failed:', err.message);
      return res.status(400).json({
        success: false,
        error: `Webhook Error: ${err.message}`
      });
    }

    // Handle the event via PaymentService
    const result = await PaymentService.handleWebhook(event);

    res.status(200).json({
      success: true,
      received: true,
      eventType: event.type,
      handled: result.handled
    });
  } catch (error) {
    console.error('❌ Error handling webhook:', error.message);

    res.status(500).json({
      success: false,
      error: 'Webhook processing failed',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/payments/refund/:paymentId
 * Refund a payment
 * Requires: paymentId in URL
 * Optional: amount (partial refund) and reason in body
 * Returns: refund confirmation
 */
router.post('/refund/:paymentId', validateRefundInput, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID is required'
      });
    }

    // Refund payment via PaymentService
    const result = await PaymentService.refundPayment(paymentId, amount, reason);

    res.status(200).json({
      success: result.success,
      data: {
        refundId: result.refundId,
        paymentId: result.paymentId,
        amount: result.amount,
        status: result.status
      }
    });
  } catch (error) {
    console.error('❌ Error refunding payment:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (error.message.includes('no Stripe charge')) {
      return res.status(400).json({
        success: false,
        error: 'Payment has no charge to refund'
      });
    }

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to refund payment',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/payments/paypal/create-order
 * Create a PayPal order for beat licensing
 * Requires: orderId and beatPrice in body
 * Returns: PayPal order ID for client-side approval
 */
router.post('/paypal/create-order', async (req, res) => {
  try {
    let { orderId, beatPrice } = req.body;
    // In development, convert orderId to UUID format and use test userId
    if (process.env.NODE_ENV === 'development') {
      orderId = stringToUUID(orderId);
    }
    const userId = process.env.NODE_ENV === 'development' ? '11111111-1111-1111-1111-111111111111' : req.user?.id;

    if (!userId && process.env.NODE_ENV !== 'development') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - authentication required'
      });
    }

    if (!orderId || !beatPrice) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId and beatPrice'
      });
    }

    // Create PayPal order via PayPalService
    const result = await PayPalService.createPayPalOrder(orderId, userId, beatPrice);

    res.status(200).json({
      success: true,
      data: {
        orderId: result.orderId,
        status: result.status,
        paymentId: result.paymentId
      }
    });
  } catch (error) {
    console.error('❌ Error creating PayPal order:', error.message);

    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access to this order'
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create PayPal order',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/payments/paypal/capture
 * Capture a PayPal order (complete the payment)
 * Requires: paypalOrderId in body
 * Returns: capture status and transaction details
 */
router.post('/paypal/capture', async (req, res) => {
  try {
    const { paypalOrderId } = req.body;

    if (!paypalOrderId) {
      return res.status(400).json({
        success: false,
        error: 'PayPal order ID is required'
      });
    }

    // Capture PayPal order via PayPalService
    const result = await PayPalService.capturePayPalOrder(paypalOrderId);

    res.status(200).json({
      success: result.success,
      data: {
        status: result.status,
        transactionId: result.transactionId,
        orderId: result.orderId,
        paymentId: result.paymentId
      }
    });
  } catch (error) {
    console.error('❌ Error capturing PayPal order:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'PayPal order not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to capture PayPal order',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/payments/paypal/refund
 * Refund a PayPal payment
 * Requires: paymentId in URL
 * Optional: amount and reason in body
 * Returns: refund confirmation
 */
router.post('/paypal/refund/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID is required'
      });
    }

    // Refund PayPal payment via PayPalService
    const result = await PayPalService.refundPayPalPayment(paymentId, amount, reason);

    res.status(200).json({
      success: result.success,
      data: {
        refundId: result.refundId,
        paymentId: result.paymentId,
        amount: result.amount,
        status: result.status
      }
    });
  } catch (error) {
    console.error('❌ Error refunding PayPal payment:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to refund PayPal payment',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
