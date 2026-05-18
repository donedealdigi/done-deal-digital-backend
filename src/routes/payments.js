const express = require('express');

const router = express.Router();

// POST create payment intent
router.post('/create-intent', (req, res) => {
  res.json({ message: 'Create payment intent', stub: true });
});

// POST stripe webhook
router.post('/webhook', (req, res) => {
  res.json({ message: 'Stripe webhook received', stub: true });
});

// GET payment status
router.get('/status/:id', (req, res) => {
  res.json({ message: 'Get payment status', paymentId: req.params.id, stub: true });
});

module.exports = router;
