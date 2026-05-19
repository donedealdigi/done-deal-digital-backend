/**
 * Input validation middleware
 */

/**
 * Validate payment input for creating payment intent
 */
const validatePaymentInput = (req, res, next) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      error: 'Order ID is required'
    });
  }

  if (typeof orderId !== 'string' || orderId.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Order ID must be a non-empty string'
    });
  }

  next();
};

/**
 * Validate refund input
 */
const validateRefundInput = (req, res, next) => {
  const { amount, reason } = req.body;

  if (amount !== undefined) {
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number'
      });
    }
  }

  if (reason !== undefined) {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Reason must be a non-empty string'
      });
    }

    // Validate reason is one of allowed values
    const allowedReasons = ['duplicate', 'fraudulent', 'requested_by_customer'];
    if (!allowedReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        error: `Reason must be one of: ${allowedReasons.join(', ')}`
      });
    }
  }

  next();
};

/**
 * Validate UUID format
 */
const validateUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

module.exports = {
  validatePaymentInput,
  validateRefundInput,
  validateUUID
};
