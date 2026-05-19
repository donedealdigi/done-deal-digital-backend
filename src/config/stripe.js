const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');

/**
 * Stripe configuration
 *
 * Initialize Stripe with secret key from environment
 * Validate that STRIPE_SECRET_KEY is set in production
 */

if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required in production');
}

/**
 * Webhook secret for verifying Stripe signatures
 */
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * Stripe configuration constants
 */
const config = {
  stripe,
  webhookSecret,
  successUrl: process.env.STRIPE_SUCCESS_URL || 'http://localhost:3000/order/success',
  cancelUrl: process.env.STRIPE_CANCEL_URL || 'http://localhost:3000/order/cancel',
  currency: 'usd',
  taxRate: 0.0,  // No tax by default, can be overridden per region
};

module.exports = config;
