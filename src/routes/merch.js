const express = require('express');
const router = express.Router();
const stripeConfig = require('../config/stripe');
const PrintfulService = require('../services/PrintfulService');
const MerchOrder = require('../models/MerchOrder');

/**
 * GET /api/merch/products
 * List all published Printful sync products from the configured store.
 * Used by the storefront grid on donedealdigital.com.
 */
router.get('/products', async (req, res) => {
  try {
    const products = await PrintfulService.listSyncProducts();
    // Normalize to a leaner shape for the frontend
    const lean = (products || []).map(p => ({
      id: p.id,
      external_id: p.external_id,
      name: p.name,
      thumbnail_url: p.thumbnail_url,
      variants: p.variants,
      synced: p.synced,
      is_ignored: p.is_ignored
    }));
    res.json({ success: true, data: lean, count: lean.length });
  } catch (err) {
    console.error('Merch list error:', err.message);
    if (err.message && err.message.includes('PRINTFUL_API_KEY')) {
      return res.status(503).json({ success: false, error: 'Merchandise service not configured' });
    }
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/merch/products/:id
 * Get a single product with its full variant list (sizes, colors, prices).
 */
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await PrintfulService.getSyncProduct(id);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Merch product detail error:', err.message);
    if (err.message && err.message.includes('404')) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
});

/**
 * POST /api/merch/shipping-rates
 * Body: { recipient: { address1, city, state_code, country_code, zip }, items: [{ sync_variant_id, quantity }] }
 * Returns array of shipping options with rates.
 */
router.post('/shipping-rates', async (req, res) => {
  try {
    const { recipient, items } = req.body;
    if (!recipient || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'recipient and items required' });
    }
    const rates = await PrintfulService.getShippingRates({ recipient, items });
    res.json({ success: true, data: rates });
  } catch (err) {
    console.error('Shipping rates error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to calculate shipping' });
  }
});

/**
 * POST /api/merch/checkout/create-intent
 * Body: { items, shippingAddress, shippingOption, email, name, subtotal, shippingCost, tax }
 * Creates a Stripe PaymentIntent + inserts a merch_orders row in 'pending' state.
 * Returns clientSecret for Stripe.js to confirm the card.
 * On payment_intent.succeeded webhook (in payments.js), we submit to Printful.
 */
router.post('/checkout/create-intent', async (req, res) => {
  try {
    const { items, shippingAddress, shippingOption, email, name, subtotal, shippingCost, tax, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items required' });
    }
    if (!shippingAddress || !shippingAddress.country_code || !shippingAddress.address1) {
      return res.status(400).json({ success: false, error: 'shippingAddress required (country_code, address1, ...)' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'valid email required' });
    }

    const subtotalNum = Number(subtotal) || 0;
    const shippingNum = Number(shippingCost) || 0;
    const taxNum = Number(tax) || 0;
    const total = subtotalNum + shippingNum + taxNum;

    if (total <= 0) {
      return res.status(400).json({ success: false, error: 'total must be > 0' });
    }
    if (total > 10000) {
      return res.status(400).json({ success: false, error: 'order total exceeds $10,000 limit' });
    }

    const totalCents = Math.round(total * 100);

    const paymentIntent = await stripeConfig.stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      receipt_email: email,
      description: `Merch order: ${items.length} item${items.length > 1 ? 's' : ''}`,
      metadata: {
        type: 'merch_order',
        customerEmail: email.substring(0, 500),
        customerName: (name || '').substring(0, 500),
        itemCount: String(items.length)
      },
      statement_descriptor_suffix: 'DONE DEAL'
    });

    const order = await MerchOrder.create({
      customerEmail: email,
      customerName: name || null,
      items, // already array, Model handles JSON.stringify
      shippingAddress,
      subtotal: subtotalNum,
      shippingCost: shippingNum,
      tax: taxNum,
      total,
      currency: 'USD',
      status: 'pending',
      stripePaymentIntentId: paymentIntent.id,
      notes: notes || null,
      metadata: { shippingOption: shippingOption || null, source: 'donedealdigital.com' }
    });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: totalCents,
        currency: 'usd',
        status: paymentIntent.status
      }
    });
  } catch (err) {
    console.error('Merch checkout error:', err.message);
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: 'Failed to create checkout intent' });
  }
});

/**
 * GET /api/merch/orders/:id
 * Look up an order's current status (so customers can track post-purchase).
 * Returns sanitized version without full address.
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await MerchOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({
      success: true,
      data: {
        id: order.id,
        status: order.status,
        total: order.total,
        currency: order.currency,
        items: order.items,
        tracking_number: order.tracking_number,
        tracking_url: order.tracking_url,
        created_at: order.created_at,
        paid_at: order.paid_at,
        submitted_at: order.submitted_at,
        fulfilled_at: order.fulfilled_at
      }
    });
  } catch (err) {
    console.error('Merch order lookup error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to look up order' });
  }
});

module.exports = router;
