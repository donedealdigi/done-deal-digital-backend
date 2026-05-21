/**
 * Public digital products catalog.
 *
 * Customer-side endpoints. Buying a product flows through the existing
 * service-deposit checkout (Stripe / PayPal). Once the payment succeeds,
 * DigitalDeliveryService attaches the file to the buyer's account and
 * emails them a signed download link.
 *
 * Authenticated downloads (post-purchase) are served by /api/account/files.
 */

const express = require('express');
const router = express.Router();
const digitalProducts = require('../config/digitalProducts');

/**
 * GET /api/downloads/catalog
 * Public list of digital products for sale.
 * Used by the frontend to render product cards dynamically.
 */
router.get('/catalog', (req, res) => {
  res.json({ success: true, data: digitalProducts.list() });
});

/**
 * GET /api/downloads/catalog/:slug
 * Public detail for a single product (price + description).
 */
router.get('/catalog/:slug', (req, res) => {
  const product = digitalProducts.get(req.params.slug);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }
  // Don't leak S3 details — only customer-facing fields.
  res.json({
    success: true,
    data: {
      slug: req.params.slug,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      contentType: product.contentType
    }
  });
});

module.exports = router;
