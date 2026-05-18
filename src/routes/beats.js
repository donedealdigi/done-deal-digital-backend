const express = require('express');

const router = express.Router();

// GET all beats
router.get('/', (req, res) => {
  res.json({ message: 'Get all beats', stub: true });
});

// GET beat by ID
router.get('/:id', (req, res) => {
  res.json({ message: 'Get beat by ID', beatId: req.params.id, stub: true });
});

// POST new beat (artist only)
router.post('/', (req, res) => {
  res.json({ message: 'Upload new beat', stub: true });
});

module.exports = router;
