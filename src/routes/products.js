const express = require('express');

const router = express.Router();

// GET all products
router.get('/', (req, res) => {
  res.json({ message: 'Get all products', stub: true });
});

// GET product by ID
router.get('/:id', (req, res) => {
  res.json({ message: 'Get product by ID', productId: req.params.id, stub: true });
});

// POST new product (admin only)
router.post('/', (req, res) => {
  res.json({ message: 'Create new product', stub: true });
});

module.exports = router;
