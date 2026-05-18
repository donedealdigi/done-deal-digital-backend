const express = require('express');

const router = express.Router();

// POST generate download link
router.post('/:beatId', (req, res) => {
  res.json({ message: 'Generate download link', beatId: req.params.beatId, stub: true });
});

// POST download stems package
router.post('/stems', (req, res) => {
  res.json({ message: 'Download stems package', stub: true });
});

module.exports = router;
