const paypalConfig = require('../config/paypal');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const crypto = require('crypto');

/**
 * Convert string to UUID format for consistent test data
 */
function stringToUUID(str) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return str;
  }
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-${hash.substr(12, 4)}-${hash.substr(16, 4)}-${hash.substr(20, 12)}`;
}

/**
 * PayPalService handles all PayPal payment processing logic
 * - Creates PayPal orders
 * - Captures payments
 * - Handles webhooks
 * - Processes refunds
 */
class PayPalService {
  /**
   * Create a PayPal order for beat licensing
   * Called when customer initiates PayPal checkout
   */
  static async createPayPalOrder(orderId, userId, beatPrice) {
    try {
      // Convert orderId to UUID format
      orderId = stringToUUID(orderId);

      // In development, allow test payments without full order validation
      let order;
      if (process.env.NODE_ENV === 'development') {
        // Check if order already exists
        order = await Order.findById(orderId);

        if (!order) {
          // Create test order in development
          order = await Order.create({
            userId,
            totalPrice: beatPrice,
            status: 'pending',
            items: [{
              name: 'Beat License',
              price: beatPrice,
              quantity: 1
            }],
            metadata: {
              beatId: orderId,
              source: 'development-test'
            }
          });
          console.log(`✅ Created test order in development: ${order.id}`);
        } else {
          console.log(`📝 Using existing order in development: ${orderId}`);
        }
      } else {
        // Get order details from database in production
        order = await Order.findById(orderId);
        if (!order) {
          throw new Error(`Order not found: ${orderId}`);
        }

        // Validate order belongs to user
        if (order.user_id !== userId) {
          throw new Error('Unauthorized: Order does not belong to this user');
        }
      }

      // Create PayPal order
      const paypalOrder = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: orderId,
            description: `Beat License - ${order.name || 'Beat License'}`,
            amount: {
              currency_code: 'USD',
              value: beatPrice.toString()
            }
          }
        ],
        application_context: {
          brand_name: 'Done Deal Digital',
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          return_url: paypalConfig.successUrl,
          cancel_url: paypalConfig.cancelUrl
        }
      };

      // Make request to PayPal to create order
      const response = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAccessToken()}`
        },
        body: JSON.stringify(paypalOrder)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`PayPal API error: ${errorData.message}`);
      }

      const paypalOrderData = await response.json();

      // Create payment record in database
      const paymentRecord = await Payment.create({
        orderId,
        userId,
        paypalOrderId: paypalOrderData.id,
        amount: beatPrice,
        currency: 'USD',
        paymentMethodType: 'paypal',
        metadata: {
          status: paypalOrderData.status,
          paypalOrderId: paypalOrderData.id
        }
      });

      // Update order with PayPal order ID
      await Order.update(orderId, {
        paypal_order_id: paypalOrderData.id,
        payment_status: 'processing'
      });

      console.log(`✅ PayPal order created: ${paypalOrderData.id}`);

      return {
        success: true,
        orderId: paypalOrderData.id,
        status: paypalOrderData.status,
        paymentId: paymentRecord.id
      };
    } catch (error) {
      console.error('❌ Error creating PayPal order:', error.message);
      throw error;
    }
  }

  /**
   * Capture a PayPal order (complete the payment)
   * Called after user approves payment on PayPal
   */
  static async capturePayPalOrder(paypalOrderId) {
    try {
      const response = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`PayPal capture error: ${errorData.message}`);
      }

      const captureData = await response.json();

      // Find payment record by PayPal order ID
      const paymentRecord = await Payment.findByPaypalOrderId(paypalOrderId);
      if (!paymentRecord) {
        throw new Error(`Payment record not found for PayPal order: ${paypalOrderId}`);
      }

      // Extract transaction details
      const transactionId = captureData.purchase_units[0].payments.captures[0].id;
      const status = captureData.purchase_units[0].payments.captures[0].status;

      // Update payment record
      await Payment.updateStatus(paymentRecord.id, status, {
        paypalTransactionId: transactionId,
        paypalOrderId: paypalOrderId
      });

      // Update order payment status
      await Payment.updateOrderPaymentStatus(paymentRecord.order_id, status);

      // Update order status to confirmed
      if (status === 'COMPLETED') {
        await Order.update(paymentRecord.order_id, {
          status: 'confirmed',
          paid_at: new Date(),
          payment_status: 'succeeded'
        });
      }

      console.log(`✅ PayPal payment captured: ${transactionId}`);

      return {
        success: status === 'COMPLETED',
        status: status,
        transactionId: transactionId,
        orderId: paymentRecord.order_id,
        paymentId: paymentRecord.id
      };
    } catch (error) {
      console.error('❌ Error capturing PayPal order:', error.message);
      throw error;
    }
  }

  /**
   * Get PayPal access token for API calls
   */
  static async getAccessToken() {
    try {
      const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en_US',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=client_credentials&client_id=${paypalConfig.clientId}&client_secret=${paypalConfig.clientSecret}`
      });

      if (!response.ok) {
        throw new Error('Failed to get PayPal access token');
      }

      const data = await response.json();
      return data.access_token;
    } catch (error) {
      console.error('❌ Error getting PayPal access token:', error.message);
      throw error;
    }
  }

  /**
   * Refund a PayPal payment
   */
  static async refundPayPalPayment(paymentId, amount = null, reason = null) {
    try {
      const paymentRecord = await Payment.findById(paymentId);

      if (!paymentRecord) {
        throw new Error(`Payment not found: ${paymentId}`);
      }

      if (!paymentRecord.paypal_transaction_id) {
        throw new Error(`Payment has no PayPal transaction ID: ${paymentId}`);
      }

      // Create refund request
      const refundBody = {
        amount: amount ? amount.toString() : paymentRecord.amount.toString()
      };

      if (reason) {
        refundBody.note_to_payer = reason;
      }

      const response = await fetch(
        `https://api-m.sandbox.paypal.com/v2/payments/captures/${paymentRecord.paypal_transaction_id}/refund`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await this.getAccessToken()}`
          },
          body: JSON.stringify(refundBody)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`PayPal refund error: ${errorData.message}`);
      }

      const refundData = await response.json();

      // Update payment status if full refund
      if (!amount || amount >= paymentRecord.amount) {
        await Payment.updateStatus(paymentId, 'refunded');
      }

      console.log(`💰 PayPal refund processed: ${refundData.id}`);

      return {
        success: true,
        refundId: refundData.id,
        paymentId,
        amount: amount || paymentRecord.amount,
        status: refundData.status
      };
    } catch (error) {
      console.error('❌ Error refunding PayPal payment:', error.message);
      throw error;
    }
  }

  /**
   * Get payment status
   */
  static async getPaymentStatus(paypalOrderId) {
    try {
      const response = await fetch(
        `https://api-m.sandbox.paypal.com/v2/checkout/orders/${paypalOrderId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${await this.getAccessToken()}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get PayPal order status');
      }

      const orderData = await response.json();
      return {
        status: orderData.status,
        orderId: paypalOrderId,
        amount: orderData.purchase_units[0].amount.value
      };
    } catch (error) {
      console.error('❌ Error getting PayPal order status:', error.message);
      throw error;
    }
  }
}

module.exports = PayPalService;
