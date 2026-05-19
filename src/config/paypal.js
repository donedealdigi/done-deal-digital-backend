/**
 * PayPal Configuration
 * Loads PayPal credentials from environment variables
 */

module.exports = {
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  mode: process.env.PAYPAL_MODE || 'sandbox',
  successUrl: process.env.PAYPAL_SUCCESS_URL || 'http://localhost:5000/checkout/success',
  cancelUrl: process.env.PAYPAL_CANCEL_URL || 'http://localhost:5000/checkout/cancel',

  // API endpoints
  apiUrl: process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
};
