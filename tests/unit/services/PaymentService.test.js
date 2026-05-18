// Mock dependencies BEFORE requiring PaymentService
jest.mock('../../../src/models/Payment');
jest.mock('../../../src/models/Order');
jest.mock('../../../src/config/stripe');

// Now require the modules
const PaymentService = require('../../../src/services/PaymentService');
const Payment = require('../../../src/models/Payment');
const Order = require('../../../src/models/Order');
const stripeConfig = require('../../../src/config/stripe');

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();
  });

  describe('createPaymentIntent()', () => {
    it('should create a payment intent successfully', async () => {
      const mockOrder = {
        id: 'order-123',
        user_id: 'user-456',
        order_number: 'ORD-123',
        total_price: 99.99,
        payment_status: 'pending'
      };

      const mockPaymentIntent = {
        id: 'pi_123456',
        client_secret: 'pi_secret_123',
        status: 'requires_payment_method',
        charges: { data: [] }
      };

      const mockPaymentRecord = {
        id: 'payment-123',
        amount: 99.99,
        currency: 'USD',
        status: 'pending'
      };

      Order.findById.mockResolvedValue(mockOrder);
      stripeConfig.stripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);
      Payment.create.mockResolvedValue(mockPaymentRecord);
      Order.update.mockResolvedValue(mockOrder);

      const result = await PaymentService.createPaymentIntent('order-123', 'user-456');

      expect(result).toEqual({
        success: true,
        paymentIntentId: 'pi_123456',
        clientSecret: 'pi_secret_123',
        amount: 99.99,
        currency: 'USD',
        status: 'requires_payment_method'
      });

      expect(Order.findById).toHaveBeenCalledWith('order-123');
      expect(stripeConfig.stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 9999, // 99.99 * 100 cents
          currency: stripeConfig.currency,
          metadata: expect.objectContaining({
            orderId: 'order-123',
            userId: 'user-456'
          })
        })
      );
      expect(Payment.create).toHaveBeenCalled();
      expect(Order.update).toHaveBeenCalled();
    });

    it('should throw error if order not found', async () => {
      Order.findById.mockResolvedValue(null);

      await expect(
        PaymentService.createPaymentIntent('nonexistent-order', 'user-456')
      ).rejects.toThrow('Order not found');
    });

    it('should throw error if user does not own order', async () => {
      const mockOrder = {
        id: 'order-123',
        user_id: 'different-user',
        total_price: 99.99,
        payment_status: 'pending'
      };

      Order.findById.mockResolvedValue(mockOrder);

      await expect(
        PaymentService.createPaymentIntent('order-123', 'user-456')
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw error if order payment status is not pending', async () => {
      const mockOrder = {
        id: 'order-123',
        user_id: 'user-456',
        total_price: 99.99,
        payment_status: 'succeeded'
      };

      Order.findById.mockResolvedValue(mockOrder);

      await expect(
        PaymentService.createPaymentIntent('order-123', 'user-456')
      ).rejects.toThrow('Cannot create payment intent');
    });

    it('should convert amount to cents for Stripe', async () => {
      const mockOrder = {
        id: 'order-123',
        user_id: 'user-456',
        order_number: 'ORD-123',
        total_price: 49.99,
        payment_status: 'pending'
      };

      Order.findById.mockResolvedValue(mockOrder);
      stripeConfig.stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'secret',
        status: 'requires_payment_method',
        charges: { data: [] }
      });
      Payment.create.mockResolvedValue({});
      Order.update.mockResolvedValue({});

      await PaymentService.createPaymentIntent('order-123', 'user-456');

      expect(stripeConfig.stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4999 // 49.99 * 100
        })
      );
    });
  });

  describe('confirmPayment()', () => {
    it('should confirm payment successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        status: 'succeeded',
        charges: {
          data: [
            {
              id: 'ch_123456',
              payment_method_details: { card: { last4: '4242' } },
              receipt_url: 'https://example.com/receipt'
            }
          ]
        }
      };

      const mockPaymentRecord = {
        id: 'payment-123',
        order_id: 'order-456'
      };

      stripeConfig.stripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
      stripeConfig.stripe.paymentIntents.confirm.mockResolvedValue(mockPaymentIntent);
      Payment.findByStripePaymentIntentId.mockResolvedValue(mockPaymentRecord);
      Payment.updateStatus.mockResolvedValue(mockPaymentRecord);
      Payment.updateOrderPaymentStatus.mockResolvedValue({});

      const result = await PaymentService.confirmPayment('pi_123456', 'pm_test');

      expect(result).toEqual({
        success: true,
        status: 'succeeded',
        paymentId: 'payment-123',
        orderId: 'order-456',
        chargeId: 'ch_123456'
      });

      expect(stripeConfig.stripe.paymentIntents.confirm).toHaveBeenCalledWith(
        'pi_123456',
        expect.objectContaining({
          payment_method: 'pm_test'
        })
      );
    });

    it('should throw error if payment intent not found', async () => {
      stripeConfig.stripe.paymentIntents.retrieve.mockResolvedValue(null);

      await expect(
        PaymentService.confirmPayment('pi_nonexistent', 'pm_test')
      ).rejects.toThrow('Payment intent not found');
    });

    it('should throw error if payment record not found', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        status: 'requires_payment_method',
        charges: { data: [] }
      };

      stripeConfig.stripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
      stripeConfig.stripe.paymentIntents.confirm.mockResolvedValue(mockPaymentIntent);
      Payment.findByStripePaymentIntentId.mockResolvedValue(null);

      await expect(
        PaymentService.confirmPayment('pi_123456', 'pm_test')
      ).rejects.toThrow('Payment record not found');
    });

    it('should extract charge details from payment intent', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        status: 'succeeded',
        charges: {
          data: [
            {
              id: 'ch_123456',
              payment_method_details: { card: { last4: '4242' } },
              receipt_url: 'https://example.com/receipt'
            }
          ]
        }
      };

      stripeConfig.stripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
      stripeConfig.stripe.paymentIntents.confirm.mockResolvedValue(mockPaymentIntent);
      Payment.findByStripePaymentIntentId.mockResolvedValue({
        id: 'payment-123',
        order_id: 'order-456'
      });
      Payment.updateStatus.mockResolvedValue({});
      Payment.updateOrderPaymentStatus.mockResolvedValue({});

      await PaymentService.confirmPayment('pi_123456', 'pm_test');

      expect(Payment.updateStatus).toHaveBeenCalledWith(
        'payment-123',
        'succeeded',
        expect.objectContaining({
          stripeChargeId: 'ch_123456',
          lastFour: '4242',
          receiptUrl: 'https://example.com/receipt'
        })
      );
    });
  });

  describe('handleWebhook()', () => {
    it('should route payment_intent.succeeded event', async () => {
      const mockEvent = {
        type: 'payment_intent.succeeded',
        data: {
          object: { id: 'pi_123' }
        }
      };

      jest.spyOn(PaymentService, 'handlePaymentSucceeded').mockResolvedValue({
        handled: true
      });

      const result = await PaymentService.handleWebhook(mockEvent);

      expect(PaymentService.handlePaymentSucceeded).toHaveBeenCalledWith(
        mockEvent.data.object
      );
      expect(result.handled).toBe(true);
    });

    it('should route payment_intent.payment_failed event', async () => {
      const mockEvent = {
        type: 'payment_intent.payment_failed',
        data: {
          object: { id: 'pi_123' }
        }
      };

      jest.spyOn(PaymentService, 'handlePaymentFailed').mockResolvedValue({
        handled: true
      });

      const result = await PaymentService.handleWebhook(mockEvent);

      expect(PaymentService.handlePaymentFailed).toHaveBeenCalledWith(
        mockEvent.data.object
      );
    });

    it('should route payment_intent.canceled event', async () => {
      const mockEvent = {
        type: 'payment_intent.canceled',
        data: {
          object: { id: 'pi_123' }
        }
      };

      jest.spyOn(PaymentService, 'handlePaymentCanceled').mockResolvedValue({
        handled: true
      });

      await PaymentService.handleWebhook(mockEvent);

      expect(PaymentService.handlePaymentCanceled).toHaveBeenCalledWith(
        mockEvent.data.object
      );
    });

    it('should route charge.refunded event', async () => {
      const mockEvent = {
        type: 'charge.refunded',
        data: {
          object: { id: 'ch_123' }
        }
      };

      jest.spyOn(PaymentService, 'handleChargeRefunded').mockResolvedValue({
        handled: true
      });

      await PaymentService.handleWebhook(mockEvent);

      expect(PaymentService.handleChargeRefunded).toHaveBeenCalledWith(
        mockEvent.data.object
      );
    });

    it('should handle unrecognized event type', async () => {
      const mockEvent = {
        type: 'unknown.event',
        data: { object: {} }
      };

      const result = await PaymentService.handleWebhook(mockEvent);

      expect(result).toEqual({
        handled: false,
        eventType: 'unknown.event'
      });
    });
  });

  describe('handlePaymentSucceeded()', () => {
    it('should handle successful payment', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        charges: {
          data: [
            {
              id: 'ch_123456',
              payment_method_details: {
                type: 'card',
                card: { last4: '4242' }
              },
              receipt_url: 'https://example.com/receipt'
            }
          ]
        }
      };

      const mockPaymentRecord = {
        id: 'payment-123',
        order_id: 'order-456',
        amount: 99.99
      };

      Payment.findByStripePaymentIntentId.mockResolvedValue(mockPaymentRecord);
      Payment.markAsPaid.mockResolvedValue(mockPaymentRecord);
      Payment.updateStatus.mockResolvedValue(mockPaymentRecord);
      Payment.updateOrderPaymentStatus.mockResolvedValue({});
      Order.update.mockResolvedValue({});

      const result = await PaymentService.handlePaymentSucceeded(mockPaymentIntent);

      expect(result).toEqual({
        handled: true,
        paymentId: 'payment-123',
        orderId: 'order-456',
        amount: 99.99
      });

      expect(Order.update).toHaveBeenCalledWith(
        'order-456',
        expect.objectContaining({
          status: 'confirmed'
        })
      );
    });

    it('should return unhandled if payment record not found', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        charges: { data: [] }
      };

      Payment.findByStripePaymentIntentId.mockResolvedValue(null);

      const result = await PaymentService.handlePaymentSucceeded(mockPaymentIntent);

      expect(result).toEqual({ handled: false });
    });
  });

  describe('handlePaymentFailed()', () => {
    it('should handle failed payment', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        last_payment_error: {
          message: 'Card declined'
        }
      };

      const mockPaymentRecord = {
        id: 'payment-123',
        order_id: 'order-456'
      };

      Payment.findByStripePaymentIntentId.mockResolvedValue(mockPaymentRecord);
      Payment.updateStatus.mockResolvedValue(mockPaymentRecord);
      Payment.updateOrderPaymentStatus.mockResolvedValue({});
      Order.update.mockResolvedValue({});

      const result = await PaymentService.handlePaymentFailed(mockPaymentIntent);

      expect(result).toEqual({
        handled: true,
        paymentId: 'payment-123',
        orderId: 'order-456',
        reason: 'Card declined'
      });

      expect(Payment.updateStatus).toHaveBeenCalledWith('payment-123', 'failed');
    });

    it('should return unhandled if payment record not found', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456'
      };

      Payment.findByStripePaymentIntentId.mockResolvedValue(null);

      const result = await PaymentService.handlePaymentFailed(mockPaymentIntent);

      expect(result).toEqual({ handled: false });
    });
  });

  describe('handlePaymentCanceled()', () => {
    it('should handle canceled payment', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456'
      };

      const mockPaymentRecord = {
        id: 'payment-123',
        order_id: 'order-456'
      };

      Payment.findByStripePaymentIntentId.mockResolvedValue(mockPaymentRecord);
      Payment.updateStatus.mockResolvedValue(mockPaymentRecord);
      Payment.updateOrderPaymentStatus.mockResolvedValue({});

      const result = await PaymentService.handlePaymentCanceled(mockPaymentIntent);

      expect(result).toEqual({
        handled: true,
        paymentId: 'payment-123',
        orderId: 'order-456'
      });

      expect(Payment.updateStatus).toHaveBeenCalledWith('payment-123', 'canceled');
    });
  });

  describe('handleChargeRefunded()', () => {
    it('should handle refunded charge', async () => {
      const mockCharge = {
        id: 'ch_123456',
        payment_intent: 'pi_123456',
        refunded: true
      };

      const mockPaymentRecord = {
        id: 'payment-123',
        order_id: 'order-456'
      };

      Payment.findById.mockResolvedValue(mockPaymentRecord);
      Payment.updateStatus.mockResolvedValue(mockPaymentRecord);
      Payment.updateOrderPaymentStatus.mockResolvedValue({});

      const result = await PaymentService.handleChargeRefunded(mockCharge);

      expect(result).toEqual({
        handled: true,
        paymentId: 'payment-123',
        orderId: 'order-456',
        chargeId: 'ch_123456'
      });

      expect(Payment.updateStatus).toHaveBeenCalledWith('payment-123', 'refunded');
    });

    it('should return unhandled if payment record not found', async () => {
      const mockCharge = {
        id: 'ch_123456',
        payment_intent: 'pi_nonexistent',
        refunded: true
      };

      Payment.findById.mockResolvedValue(null);

      const result = await PaymentService.handleChargeRefunded(mockCharge);

      expect(result).toEqual({ handled: false });
    });
  });

  describe('refundPayment()', () => {
    it('should refund a full payment', async () => {
      const mockPaymentRecord = {
        id: 'payment-123',
        order_id: 'order-456',
        amount: 99.99,
        stripe_charge_id: 'ch_123456'
      };

      const mockRefund = {
        id: 'ref_123456',
        amount: 9999, // In cents
        status: 'succeeded'
      };

      Payment.findById.mockResolvedValue(mockPaymentRecord);
      stripeConfig.stripe.refunds.create.mockResolvedValue(mockRefund);
      Payment.updateStatus.mockResolvedValue(mockPaymentRecord);

      const result = await PaymentService.refundPayment('payment-123');

      expect(result).toEqual({
        success: true,
        refundId: 'ref_123456',
        paymentId: 'payment-123',
        amount: 99.99,
        status: 'succeeded'
      });

      expect(stripeConfig.stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          charge: 'ch_123456',
          reason: 'requested_by_customer'
        })
      );
    });

    it('should support partial refunds', async () => {
      const mockPaymentRecord = {
        id: 'payment-123',
        order_id: 'order-456',
        amount: 99.99,
        stripe_charge_id: 'ch_123456'
      };

      const mockRefund = {
        id: 'ref_123456',
        amount: 5000, // 50.00 in cents
        status: 'succeeded'
      };

      Payment.findById.mockResolvedValue(mockPaymentRecord);
      stripeConfig.stripe.refunds.create.mockResolvedValue(mockRefund);

      await PaymentService.refundPayment('payment-123', 50.00, 'requested_by_customer');

      expect(stripeConfig.stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000, // 50.00 * 100
          reason: 'requested_by_customer'
        })
      );
    });

    it('should throw error if payment not found', async () => {
      Payment.findById.mockResolvedValue(null);

      await expect(PaymentService.refundPayment('nonexistent-id')).rejects.toThrow(
        'Payment not found'
      );
    });

    it('should throw error if payment has no charge ID', async () => {
      const mockPaymentRecord = {
        id: 'payment-123',
        stripe_charge_id: null
      };

      Payment.findById.mockResolvedValue(mockPaymentRecord);

      await expect(PaymentService.refundPayment('payment-123')).rejects.toThrow(
        'no Stripe charge'
      );
    });

    it('should update payment status only on full refund', async () => {
      const mockPaymentRecord = {
        id: 'payment-123',
        amount: 99.99,
        stripe_charge_id: 'ch_123456'
      };

      stripeConfig.stripe.refunds.create.mockResolvedValue({
        id: 'ref_123456',
        amount: 9999
      });
      Payment.findById.mockResolvedValue(mockPaymentRecord);
      Payment.updateStatus.mockResolvedValue({});

      await PaymentService.refundPayment('payment-123');

      expect(Payment.updateStatus).toHaveBeenCalledWith('payment-123', 'refunded');
    });

    it('should not update status for partial refunds', async () => {
      const mockPaymentRecord = {
        id: 'payment-123',
        amount: 99.99,
        stripe_charge_id: 'ch_123456'
      };

      stripeConfig.stripe.refunds.create.mockResolvedValue({
        id: 'ref_123456',
        amount: 5000 // 50.00, less than full amount
      });
      Payment.findById.mockResolvedValue(mockPaymentRecord);
      Payment.updateStatus.mockResolvedValue({});

      await PaymentService.refundPayment('payment-123', 50.00);

      expect(Payment.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentStatus()', () => {
    it('should return payment status and details', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        status: 'succeeded'
      };

      const mockPaymentRecord = {
        id: 'payment-123',
        order_id: 'order-456',
        amount: 99.99,
        currency: 'USD',
        payment_method_type: 'card',
        last_four: '4242',
        receipt_url: 'https://example.com/receipt',
        created_at: '2023-01-01T00:00:00Z'
      };

      stripeConfig.stripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
      Payment.findByStripePaymentIntentId.mockResolvedValue(mockPaymentRecord);

      const result = await PaymentService.getPaymentStatus('pi_123456');

      expect(result).toEqual({
        paymentId: 'payment-123',
        orderId: 'order-456',
        status: 'succeeded',
        amount: 99.99,
        currency: 'USD',
        paymentMethod: 'card',
        lastFour: '4242',
        createdAt: '2023-01-01T00:00:00Z',
        receiptUrl: 'https://example.com/receipt'
      });
    });

    it('should throw error if payment record not found', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        status: 'succeeded'
      };

      stripeConfig.stripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
      Payment.findByStripePaymentIntentId.mockResolvedValue(null);

      await expect(
        PaymentService.getPaymentStatus('pi_123456')
      ).rejects.toThrow('Payment record not found');
    });
  });
});
