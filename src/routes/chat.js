const express = require('express');

const router = express.Router();

// POST send message to chatbot
router.post('/message', (req, res) => {
  res.json({ message: 'Message sent to chatbot', stub: true });
});

// GET conversation history
router.get('/history', (req, res) => {
  res.json({ message: 'Get conversation history', stub: true });
});

// POST escalate to human support
router.post('/escalate', (req, res) => {
  res.json({ message: 'Escalated to human support', stub: true });
});

module.exports = router;
