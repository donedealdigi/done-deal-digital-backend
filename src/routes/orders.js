const express = require('express');

const router = express.Router();

// GET user's orders
router.get('/', (req, res) => {
  res.json({ message: 'Get user orders', userId: req.user.userId, stub: true });
});

// GET order by ID
router.get('/:id', (req, res) => {
  res.json({ message: 'Get order by ID', orderId: req.params.id, stub: true });
});

// POST create order
router.post('/', (req, res) => {
  res.json({ message: 'Create new order', stub: true });
});

module.exports = router;
