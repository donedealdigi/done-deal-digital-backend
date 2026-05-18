const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Validation errors
  if (err.statusCode === 400) {
    return res.status(400).json({
      error: err.message || 'Validation error',
      details: err.details || []
    });
  }

  // Authentication errors
  if (err.statusCode === 401) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  // Authorization errors
  if (err.statusCode === 403) {
    return res.status(403).json({
      error: 'Forbidden'
    });
  }

  // Not found
  if (err.statusCode === 404) {
    return res.status(404).json({
      error: err.message || 'Not found'
    });
  }

  // Stripe errors
  if (err.type === 'StripeInvalidRequestError') {
    return res.status(400).json({
      error: 'Payment processing error',
      message: err.message
    });
  }

  // Database errors
  if (err.code && err.code.startsWith('42')) {
    return res.status(500).json({
      error: 'Database error',
      message: process.env.NODE_ENV === 'production' ? 'Database operation failed' : err.message
    });
  }

  // Default error response
  res.status(err.statusCode || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

module.exports = {
  errorHandler
};
