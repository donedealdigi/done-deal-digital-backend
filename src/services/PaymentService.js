const stripeConfig = require('../config/stripe');
const Payment = require('../models/Payment');
const Order = require('../models/Order');

/**
 * PaymentService handles all Stripe payment processing logic
 * - Creates payment intents
 * - Confirms payments
 * - Handles webhooks
 * - Processes refunds
 */
class PaymentService {
  /**
   * Create a payment intent for an order
   * Called when customer initiates checkout
   */
  static async createPaymentIntent(orderId, userId) {
    try {
      // Get order details
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Validate order belongs to user
      if (order.user_id !== userId) {
        throw new Error('Unauthorized: Order does not belong to this user');
      }

      // Validate order status is pending payment
      if (order.payment_status && order.payment_status !== 'pending') {
        throw new Error(`Cannot create payment intent for order with status: ${order.payment_status}`);
      }

      // Create payment intent with Stripe
      const paymentIntent = await stripeConfig.stripe.paymentIntents.create({
        amount: Math.round(order.total_price * 100), // Convert to cents
        currency: stripeConfig.currency,
        metadata: {
          orderId,
          userId,
          orderNumber: order.order_number || orderId.substring(0, 8).toUpperCase()
        },
        description: `Order ${order.order_number || orderId.substring(0, 8)} - Done Deal Digital`,
        statement_descriptor: 'DONE DEAL DIGITAL'
      });

      // Create payment record in database
      const paymentRecord = await Payment.create({
        orderId,
        userId,
        stripePaymentIntentId: paymentIntent.id,
        amount: order.total_price,
        currency: stripeConfig.currency,
        paymentMethodType: null,
        metadata: {
          status: paymentIntent.status,
          clientSecret: paymentIntent.client_secret
        }
      });

      // Update order with payment intent ID
      await Order.update(orderId, {
        stripe_payment_intent_id: paymentIntent.id,
        payment_status: 'processing'
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        status: paymentIntent.status
      };
    } catch (error) {
      console.error('❌ Error creating payment intent:', error.message);
      throw error;
    }
  }

  /**
   * Confirm a payment intent (called after client-side payment method submission)
   */
  static async confirmPayment(paymentIntentId, paymentMethodId) {
    try {
      // Get payment intent from Stripe
      const paymentIntent = await stripeConfig.stripe.paymentIntents.retrieve(paymentIntentId);

      if (!paymentIntent) {
        throw new Error(`Payment intent not found: ${paymentIntentId}`);
      }

      // Confirm the payment intent with the payment method
      const confirmedIntent = await stripeConfig.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
        return_url: stripeConfig.successUrl
      });

      // Get the payment record
      const paymentRecord = await Payment.findByStripePaymentIntentId(paymentIntentId);
      if (!paymentRecord) {
        throw new Error(`Payment record not found for intent: ${paymentIntentId}`);
      }

      // Update payment record with confirmation data
      const updatedPayment = await Payment.updateStatus(
        paymentRecord.id,
        confirmedIntent.status,
        {
          stripeChargeId: confirmedIntent.charges.data[0]?.id,
          lastFour: confirmedIntent.charges.data[0]?.payment_method_details?.card?.last4,
          receiptUrl: confirmedIntent.charges.data[0]?.receipt_url
        }
      );

      // Update order payment status
      await Payment.updateOrderPaymentStatus(paymentRecord.order_id, confirmedIntent.status);

      return {
        success: confirmedIntent.status === 'succeeded',
        status: confirmedIntent.status,
        paymentId: paymentRecord.id,
        orderId: paymentRecord.order_id,
        chargeId: confirmedIntent.charges.data[0]?.id
      };
    } catch (error) {
      console.error('❌ Error confirming payment:', error.message);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   * Processes payment_intent events and charge events
   */
  static async handleWebhook(event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          return await this.handlePaymentSucceeded(event.data.object);

        case 'payment_intent.payment_failed':
          return await this.handlePaymentFailed(event.data.object);

        case 'payment_intent.canceled':
          return await this.handlePaymentCanceled(event.data.object);

        case 'charge.refunded':
          return await this.handleChargeRefunded(event.data.object);

        default:
          console.log(`⚠️  Unhandled webhook event type: ${event.type}`);
          return { handled: false, eventType: event.type };
      }
    } catch (error) {
      console.error('❌ Error handling webhook:', error.message);
      throw error;
    }
  }

  /**
   * Handle successful payment intent
   */
  static async handlePaymentSucceeded(paymentIntent) {
    try {
      const paymentRecord = await Payment.findByStripePaymentIntentId(paymentIntent.id);

      if (!paymentRecord) {
        console.warn(`Payment record not found for intent: ${paymentIntent.id}`);
        return { handled: false };
      }

      // Update payment status
      const chargeId = paymentIntent.charges.data[0]?.id;
      const receiptUrl = paymentIntent.charges.data[0]?.receipt_url;
      const lastFour = paymentIntent.charges.data[0]?.payment_method_details?.card?.last4;

      await Payment.markAsPaid(paymentRecord.id, chargeId, receiptUrl);

      // Update payment method type
      if (paymentIntent.charges.data[0]?.payment_method_details?.type) {
        await Payment.updateStatus(paymentRecord.id, 'succeeded', {
          stripeChargeId: chargeId,
          lastFour,
          receiptUrl
        });
      }

      // Update order payment status
      await Payment.updateOrderPaymentStatus(paymentRecord.order_id, 'succeeded');

      // Update order status to confirmed/processing (business logic)
      await Order.update(paymentRecord.order_id, {
        status: 'confirmed',
        paid_at: new Date()
      });

      console.log(`✅ Payment succeeded for order: ${paymentRecord.order_id}`);

      const returnValue = {
        handled: true,
        paymentId: paymentRecord.id,
        orderId: paymentRecord.order_id,
        amount: paymentRecord.amount
      };
      return returnValue;
    } catch (error) {
      console.error('❌ Error handling payment succeeded:', error.message);
      throw error;
    }
  }

  /**
   * Handle failed payment intent
   */
  static async handlePaymentFailed(paymentIntent) {
    try {
      const paymentRecord = await Payment.findByStripePaymentIntentId(paymentIntent.id);

      if (!paymentRecord) {
        console.warn(`Payment record not found for failed intent: ${paymentIntent.id}`);
        return { handled: false };
      }

      // Update payment status to failed
      await Payment.updateStatus(paymentRecord.id, 'failed');

      // Update order payment status
      await Payment.updateOrderPaymentStatus(paymentRecord.order_id, 'failed');

      // Optionally update order status back to pending
      await Order.update(paymentRecord.order_id, {
        payment_status: 'failed'
      });

      console.log(`❌ Payment failed for order: ${paymentRecord.order_id}`);

      const returnValue = {
        handled: true,
        paymentId: paymentRecord.id,
        orderId: paymentRecord.order_id,
        reason: paymentIntent.last_payment_error?.message
      };
      return returnValue;
    } catch (error) {
      console.error('❌ Error handling payment failed:', error.message);
      throw error;
    }
  }

  /**
   * Handle canceled payment intent
   */
  static async handlePaymentCanceled(paymentIntent) {
    try {
      const paymentRecord = await Payment.findByStripePaymentIntentId(paymentIntent.id);

      if (!paymentRecord) {
        console.warn(`Payment record not found for canceled intent: ${paymentIntent.id}`);
        return { handled: false };
      }

      // Update payment status
      await Payment.updateStatus(paymentRecord.id, 'canceled');

      // Update order payment status
      await Payment.updateOrderPaymentStatus(paymentRecord.order_id, 'canceled');

      console.log(`⚠️  Payment canceled for order: ${paymentRecord.order_id}`);

      const returnValue = {
        handled: true,
        paymentId: paymentRecord.id,
        orderId: paymentRecord.order_id
      };
      return returnValue;
    } catch (error) {
      console.error('❌ Error handling payment canceled:', error.message);
      throw error;
    }
  }

  /**
   * Handle charge refunded event
   */
  static async handleChargeRefunded(charge) {
    try {
      // Find payment by stripe charge ID
      const paymentRecord = await Payment.findById(charge.payment_intent);

      if (!paymentRecord) {
        console.warn(`Payment record not found for charge: ${charge.id}`);
        return { handled: false };
      }

      // Update payment status to refunded if full refund
      if (charge.refunded) {
        await Payment.updateStatus(paymentRecord.id, 'refunded');
        await Payment.updateOrderPaymentStatus(paymentRecord.order_id, 'refunded');
      }

      console.log(`💰 Payment refunded for order: ${paymentRecord.order_id}`);

      const returnValue = {
        handled: true,
        paymentId: paymentRecord.id,
        orderId: paymentRecord.order_id,
        chargeId: charge.id
      };
      return returnValue;
    } catch (error) {
      console.error('❌ Error handling charge refunded:', error.message);
      throw error;
    }
  }

  /**
   * Refund a payment
   */
  static async refundPayment(paymentId, amount = null, reason = null) {
    try {
      const paymentRecord = await Payment.findById(paymentId);

      if (!paymentRecord) {
        throw new Error(`Payment not found: ${paymentId}`);
      }

      if (!paymentRecord.stripe_charge_id) {
        throw new Error(`Payment has no Stripe charge ID: ${paymentId}`);
      }

      // Create refund in Stripe
      const refund = await stripeConfig.stripe.refunds.create({
        charge: paymentRecord.stripe_charge_id,
        amount: amount ? Math.round(amount * 100) : undefined, // Partial refund if amount specified
        reason: reason || 'requested_by_customer',
        metadata: {
          paymentId,
          orderId: paymentRecord.order_id
        }
      });

      console.log(`💰 Refund created: ${refund.id} for payment: ${paymentId}`);

      // Update payment status if full refund
      if (!amount || amount >= paymentRecord.amount) {
        await Payment.updateStatus(paymentId, 'refunded');
      }

      return {
        success: true,
        refundId: refund.id,
        paymentId,
        amount: refund.amount / 100,
        status: refund.status
      };
    } catch (error) {
      console.error('❌ Error refunding payment:', error.message);
      throw error;
    }
  }

  /**
   * Get payment status and details
   */
  static async getPaymentStatus(paymentIntentId) {
    try {
      // Get payment intent from Stripe
      const paymentIntent = await stripeConfig.stripe.paymentIntents.retrieve(paymentIntentId);

      // Get payment record from database
      const paymentRecord = await Payment.findByStripePaymentIntentId(paymentIntentId);

      if (!paymentRecord) {
        throw new Error(`Payment record not found for intent: ${paymentIntentId}`);
      }

      return {
        paymentId: paymentRecord.id,
        orderId: paymentRecord.order_id,
        status: paymentIntent.status,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        paymentMethod: paymentRecord.payment_method_type,
        lastFour: paymentRecord.last_four,
        createdAt: paymentRecord.created_at,
        receiptUrl: paymentRecord.receipt_url
      };
    } catch (error) {
      console.error('❌ Error getting payment status:', error.message);
      throw error;
    }
  }
}

module.exports = PaymentService;
