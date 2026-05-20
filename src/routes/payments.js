const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const stripeConfig = require('../config/stripe');
const PaymentService = require('../services/PaymentService');
const PayPalService = require('../services/PayPalService');
const ServiceDeposit = require('../models/ServiceDeposit');
const EmailService = require('../services/EmailService');
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

    // If this is a service deposit (identified by metadata.type), handle it here
    // before delegating to PaymentService (which expects order-linked payments).
    const obj = event.data?.object;
    const isDeposit = obj?.metadata?.type === 'service_deposit';

    if (isDeposit) {
      try {
        if (event.type === 'payment_intent.succeeded') {
          const chargeId = obj.latest_charge || null;
          const deposit = await ServiceDeposit.markPaid(obj.id, chargeId);
          if (deposit) {
            // Send customer receipt + internal notification (best-effort)
            const args = {
              customerName: deposit.customer_name,
              customerEmail: deposit.customer_email,
              serviceName: deposit.service_name,
              amount: deposit.amount,
              paymentIntentId: deposit.stripe_payment_intent_id,
              notes: deposit.notes
            };
            EmailService.sendMail(EmailService.templates.depositReceipt(args)).catch(e => console.error('receipt email failed', e));
            EmailService.sendMail(EmailService.templates.depositNotification(args)).catch(e => console.error('notification email failed', e));
          }
        } else if (event.type === 'payment_intent.payment_failed' || event.type === 'charge.failed') {
          await ServiceDeposit.markFailed(obj.id || obj.payment_intent);
        }
      } catch (e) {
        console.error('❌ Deposit webhook handling error:', e.message);
        // Do not throw — Stripe expects 2xx on processed events even if our side errors.
      }
      return res.status(200).json({ success: true, received: true, eventType: event.type, handled: 'deposit' });
    }

    // Otherwise, delegate to the existing PaymentService (order-linked payments)
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

/* ============================================================
 * SERVICE DEPOSIT CHECKOUT
 * Customer pays a deposit on donedealdigital.com for a service
 * (production, mixing, video, package, etc.). No login required.
 * Creates a Stripe PaymentIntent + a service_deposits DB row.
 * Webhook handler above flips status to 'succeeded' + sends emails.
 * ============================================================ */

router.post('/service-deposit/create-intent', async (req, res) => {
  try {
    const { amount, email, name, serviceSlug, serviceName, depositType, notes } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, error: 'amount (USD dollars) required and must be positive' });
    }
    if (amount > 10000) {
      return res.status(400).json({ success: false, error: 'amount exceeds limit ($10,000)' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'valid email required' });
    }
    if (!serviceSlug || !serviceName) {
      return res.status(400).json({ success: false, error: 'serviceSlug and serviceName required' });
    }
    const allowedTypes = ['fixed', 'package', 'custom'];
    const finalDepositType = allowedTypes.includes(depositType) ? depositType : 'fixed';

    const amountCents = Math.round(amount * 100);

    // 1. Create Stripe PaymentIntent
    const paymentIntent = await stripeConfig.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      receipt_email: email,
      description: `Service Deposit: ${serviceName}`,
      metadata: {
        type: 'service_deposit',
        serviceSlug: serviceSlug.substring(0, 500),
        serviceName: serviceName.substring(0, 500),
        depositType: finalDepositType,
        customerEmail: email.substring(0, 500),
        customerName: (name || '').substring(0, 500)
      },
      statement_descriptor_suffix: 'DONE DEAL'
    });

    // 2. Insert a DB row tracking this deposit attempt
    await ServiceDeposit.create({
      customerEmail: email,
      customerName: name || null,
      serviceSlug,
      serviceName,
      depositType: finalDepositType,
      amount,
      currency: 'USD',
      status: 'pending',
      stripePaymentIntentId: paymentIntent.id,
      notes: notes || null,
      metadata: { source: 'donedealdigital.com' }
    });

    res.status(200).json({
      success: true,
      data: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: amountCents,
        currency: 'usd',
        status: paymentIntent.status
      }
    });
  } catch (error) {
    console.error('❌ Service deposit create-intent error:', error.message);
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to create deposit intent' });
  }
});

/* ===== PayPal flow for service deposits ===== */

async function getPaypalAccessTokenForDeposit() {
  const paypalConfig = require('../config/paypal');
  const r = await fetch(`${paypalConfig.apiUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${paypalConfig.clientId}:${paypalConfig.clientSecret}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`PayPal token request failed: ${r.status} ${err}`);
  }
  const data = await r.json();
  return { accessToken: data.access_token, apiUrl: paypalConfig.apiUrl };
}

/**
 * POST /api/payments/service-deposit/paypal/create-order
 * Body: { amount, email, name, serviceSlug, serviceName, depositType, notes }
 * Returns: { orderId } — used by the PayPal Smart Buttons SDK to render approval flow
 */
router.post('/service-deposit/paypal/create-order', async (req, res) => {
  try {
    const { amount, email, name, serviceSlug, serviceName, depositType, notes } = req.body;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, error: 'amount required and positive' });
    }
    if (amount > 10000) return res.status(400).json({ success: false, error: 'amount exceeds $10,000 limit' });
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, error: 'valid email required' });
    if (!serviceSlug || !serviceName) return res.status(400).json({ success: false, error: 'serviceSlug and serviceName required' });
    const finalDepositType = ['fixed', 'package', 'custom'].includes(depositType) ? depositType : 'fixed';

    const { accessToken, apiUrl } = await getPaypalAccessTokenForDeposit();
    const r = await fetch(`${apiUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: amount.toFixed(2) },
          description: `Service Deposit: ${serviceName}`.substring(0, 127),
          custom_id: `deposit_${serviceSlug}_${Date.now()}`.substring(0, 127)
        }],
        application_context: {
          brand_name: 'Done Deal Digital',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING'
        }
      })
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`PayPal create-order failed: ${r.status} ${err}`);
    }
    const data = await r.json();

    await ServiceDeposit.createPaypal({
      customerEmail: email,
      customerName: name || null,
      serviceSlug,
      serviceName,
      depositType: finalDepositType,
      amount,
      currency: 'USD',
      status: 'pending',
      paypalOrderId: data.id,
      notes: notes || null,
      metadata: { source: 'donedealdigital.com', provider: 'paypal' }
    });

    res.status(200).json({ success: true, data: { orderId: data.id, status: data.status } });
  } catch (error) {
    console.error('❌ Deposit PayPal create-order error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create PayPal order' });
  }
});

/**
 * POST /api/payments/service-deposit/paypal/capture
 * Body: { orderId }
 * Captures the approved PayPal order, marks deposit succeeded, fires emails.
 */
router.post('/service-deposit/paypal/capture', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });

    const { accessToken, apiUrl } = await getPaypalAccessTokenForDeposit();
    const r = await fetch(`${apiUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`PayPal capture failed: ${r.status} ${err}`);
    }
    const data = await r.json();
    const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;

    if (data.status === 'COMPLETED') {
      const deposit = await ServiceDeposit.markPaypalCaptured(orderId, captureId);
      if (deposit) {
        const args = {
          customerName: deposit.customer_name,
          customerEmail: deposit.customer_email,
          serviceName: deposit.service_name,
          amount: deposit.amount,
          paymentIntentId: `PayPal:${orderId}`,
          notes: deposit.notes
        };
        EmailService.sendMail(EmailService.templates.depositReceipt(args)).catch(e => console.error('PayPal receipt email failed', e));
        EmailService.sendMail(EmailService.templates.depositNotification(args)).catch(e => console.error('PayPal notification email failed', e));
      }
    }

    res.status(200).json({
      success: true,
      data: { orderId: data.id, status: data.status, captureId }
    });
  } catch (error) {
    console.error('❌ Deposit PayPal capture error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to capture PayPal order' });
  }
});

module.exports = router;
