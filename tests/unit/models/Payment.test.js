const Payment = require('../../../src/models/Payment');
const pool = require('../../../src/config/database');

// Mock the database pool
jest.mock('../../../src/config/database');

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234')
}));

describe('Payment Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('should create a new payment record', async () => {
      const paymentData = {
        orderId: 'order-123',
        userId: 'user-456',
        stripePaymentIntentId: 'pi_123456',
        amount: 99.99,
        currency: 'USD',
        paymentMethodType: 'card',
        metadata: { test: true }
      };

      const mockPayment = {
        id: 'test-uuid-1234',
        order_id: 'order-123',
        user_id: 'user-456',
        stripe_payment_intent_id: 'pi_123456',
        amount: 99.99,
        currency: 'USD',
        status: 'pending',
        payment_method_type: 'card',
        metadata: { test: true },
        created_at: new Date(),
        updated_at: new Date()
      };

      pool.query.mockResolvedValue({ rows: [mockPayment] });

      const result = await Payment.create(paymentData);

      expect(result).toEqual(mockPayment);
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payments'),
        expect.arrayContaining(['test-uuid-1234', 'order-123', 'user-456', 'pi_123456'])
      );
    });

    it('should set default currency to USD', async () => {
      const paymentData = {
        orderId: 'order-123',
        userId: 'user-456',
        stripePaymentIntentId: 'pi_123456',
        amount: 99.99
      };

      pool.query.mockResolvedValue({ rows: [{ ...paymentData, status: 'pending' }] });

      await Payment.create(paymentData);

      const callArgs = pool.query.mock.calls[0][1];
      expect(callArgs[5]).toBe('USD'); // Currency is at index 5
    });

    it('should set status to pending by default', async () => {
      const paymentData = {
        orderId: 'order-123',
        userId: 'user-456',
        stripePaymentIntentId: 'pi_123456',
        amount: 99.99
      };

      pool.query.mockResolvedValue({ rows: [{ ...paymentData, status: 'pending' }] });

      await Payment.create(paymentData);

      const callArgs = pool.query.mock.calls[0][1];
      expect(callArgs[6]).toBe('pending'); // Status is at index 6
    });

    it('should stringify metadata', async () => {
      const paymentData = {
        orderId: 'order-123',
        userId: 'user-456',
        stripePaymentIntentId: 'pi_123456',
        amount: 99.99,
        metadata: { key: 'value' }
      };

      pool.query.mockResolvedValue({ rows: [{ ...paymentData, status: 'pending' }] });

      await Payment.create(paymentData);

      const callArgs = pool.query.mock.calls[0][1];
      expect(typeof callArgs[8]).toBe('string'); // Metadata should be stringified
      expect(callArgs[8]).toBe(JSON.stringify({ key: 'value' }));
    });
  });

  describe('findById()', () => {
    it('should find payment by ID', async () => {
      const mockPayment = {
        id: 'payment-123',
        order_id: 'order-456',
        status: 'pending'
      };

      pool.query.mockResolvedValue({ rows: [mockPayment] });

      const result = await Payment.findById('payment-123');

      expect(result).toEqual(mockPayment);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM payments WHERE id = $1',
        ['payment-123']
      );
    });

    it('should return null if payment not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Payment.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByStripePaymentIntentId()', () => {
    it('should find payment by Stripe payment intent ID', async () => {
      const mockPayment = {
        id: 'payment-123',
        stripe_payment_intent_id: 'pi_123456',
        status: 'pending'
      };

      pool.query.mockResolvedValue({ rows: [mockPayment] });

      const result = await Payment.findByStripePaymentIntentId('pi_123456');

      expect(result).toEqual(mockPayment);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM payments WHERE stripe_payment_intent_id = $1',
        ['pi_123456']
      );
    });

    it('should return null if intent not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Payment.findByStripePaymentIntentId('pi_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByOrderId()', () => {
    it('should find all payments for an order', async () => {
      const mockPayments = [
        { id: 'payment-1', order_id: 'order-123', created_at: new Date() },
        { id: 'payment-2', order_id: 'order-123', created_at: new Date() }
      ];

      pool.query.mockResolvedValue({ rows: mockPayments });

      const result = await Payment.findByOrderId('order-123');

      expect(result).toEqual(mockPayments);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM payments WHERE order_id = $1'),
        ['order-123']
      );
    });

    it('should return empty array if no payments found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Payment.findByOrderId('order-xyz');

      expect(result).toEqual([]);
    });
  });

  describe('findByUserId()', () => {
    it('should find payments by user ID with pagination', async () => {
      const mockPayments = [
        { id: 'payment-1', user_id: 'user-123' },
        { id: 'payment-2', user_id: 'user-123' }
      ];

      pool.query.mockResolvedValue({ rows: mockPayments });

      const result = await Payment.findByUserId('user-123', 50, 0);

      expect(result).toEqual(mockPayments);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-123', 50, 0]
      );
    });

    it('should apply default pagination limits', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await Payment.findByUserId('user-123');

      expect(pool.query).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['user-123', 50, 0])
      );
    });
  });

  describe('updateStatus()', () => {
    it('should update payment status', async () => {
      const mockUpdatedPayment = {
        id: 'payment-123',
        status: 'succeeded',
        updated_at: new Date()
      };

      pool.query.mockResolvedValue({ rows: [mockUpdatedPayment] });

      const result = await Payment.updateStatus('payment-123', 'succeeded');

      expect(result).toEqual(mockUpdatedPayment);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payments'),
        expect.arrayContaining(['payment-123', 'succeeded'])
      );
    });

    it('should update with stripe charge ID', async () => {
      const mockUpdatedPayment = {
        id: 'payment-123',
        status: 'succeeded',
        stripe_charge_id: 'ch_123456'
      };

      pool.query.mockResolvedValue({ rows: [mockUpdatedPayment] });

      const result = await Payment.updateStatus('payment-123', 'succeeded', {
        stripeChargeId: 'ch_123456'
      });

      expect(result).toEqual(mockUpdatedPayment);
      const query = pool.query.mock.calls[0][0];
      expect(query).toContain('stripe_charge_id');
    });

    it('should update with last four digits', async () => {
      pool.query.mockResolvedValue({ rows: [{}] });

      await Payment.updateStatus('payment-123', 'succeeded', {
        lastFour: '4242'
      });

      const query = pool.query.mock.calls[0][0];
      expect(query).toContain('last_four');
    });

    it('should update with receipt URL', async () => {
      pool.query.mockResolvedValue({ rows: [{}] });

      await Payment.updateStatus('payment-123', 'succeeded', {
        receiptUrl: 'https://example.com/receipt'
      });

      const query = pool.query.mock.calls[0][0];
      expect(query).toContain('receipt_url');
    });

    it('should return null if payment not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Payment.updateStatus('nonexistent-id', 'succeeded');

      expect(result).toBeNull();
    });
  });

  describe('updateOrderPaymentStatus()', () => {
    it('should update order payment status', async () => {
      const mockUpdatedOrder = {
        id: 'order-123',
        payment_status: 'succeeded'
      };

      pool.query.mockResolvedValue({ rows: [mockUpdatedOrder] });

      const result = await Payment.updateOrderPaymentStatus('order-123', 'succeeded');

      expect(result).toEqual(mockUpdatedOrder);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        expect.arrayContaining(['succeeded', 'order-123'])
      );
    });

    it('should return null if order not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Payment.updateOrderPaymentStatus('nonexistent-order', 'succeeded');

      expect(result).toBeNull();
    });
  });

  describe('markAsPaid()', () => {
    it('should mark payment as paid with charge ID and receipt', async () => {
      const mockUpdatedPayment = {
        id: 'payment-123',
        status: 'succeeded',
        stripe_charge_id: 'ch_123456',
        receipt_url: 'https://example.com/receipt'
      };

      pool.query.mockResolvedValue({ rows: [mockUpdatedPayment] });

      const result = await Payment.markAsPaid(
        'payment-123',
        'ch_123456',
        'https://example.com/receipt'
      );

      expect(result).toEqual(mockUpdatedPayment);
      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe('getStats()', () => {
    it('should retrieve payment statistics', async () => {
      const mockStats = {
        total_payments: 100,
        successful_payments: 95,
        total_revenue: 9500.00,
        avg_payment: 95.00,
        min_payment: 10.00,
        max_payment: 500.00
      };

      pool.query.mockResolvedValue({ rows: [mockStats] });

      const result = await Payment.getStats();

      expect(result).toEqual(mockStats);
      expect(pool.query).toHaveBeenCalled();
      const query = pool.query.mock.calls[0][0];
      expect(query).toContain('SELECT');
      expect(query).toContain('total_payments');
    });

    it('should return stats with correct aggregations', async () => {
      const mockStats = {
        total_payments: '100',
        successful_payments: '95',
        total_revenue: '9500.00'
      };

      pool.query.mockResolvedValue({ rows: [mockStats] });

      const result = await Payment.getStats();

      expect(result).toHaveProperty('total_payments');
      expect(result).toHaveProperty('successful_payments');
      expect(result).toHaveProperty('total_revenue');
    });
  });

  describe('getRecentSuccessful()', () => {
    it('should retrieve recent successful payments with user info', async () => {
      const mockPayments = [
        {
          id: 'payment-1',
          user_id: 'user-123',
          amount: 99.99,
          email: 'test@example.com',
          display_name: 'Test User',
          created_at: new Date()
        },
        {
          id: 'payment-2',
          user_id: 'user-456',
          amount: 199.99,
          email: 'another@example.com',
          display_name: 'Another User',
          created_at: new Date()
        }
      ];

      pool.query.mockResolvedValue({ rows: mockPayments });

      const result = await Payment.getRecentSuccessful(20);

      expect(result).toEqual(mockPayments);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN users u ON'),
        [20]
      );
    });

    it('should apply default limit of 20', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await Payment.getRecentSuccessful();

      expect(pool.query).toHaveBeenCalledWith(
        expect.anything(),
        [20]
      );
    });

    it('should only return succeeded payments', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await Payment.getRecentSuccessful(50);

      const query = pool.query.mock.calls[0][0];
      expect(query).toContain("WHERE p.status = 'succeeded'");
    });
  });
});
