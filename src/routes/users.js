const express = require('express');
const User = require('../models/User');

const router = express.Router();

// GET current user profile
router.get('/profile', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// PUT update user profile
router.put('/profile', async (req, res, next) => {
  try {
    const { displayName, avatarUrl } = req.body;
    const user = await User.update(req.user.userId, {
      display_name: displayName,
      avatar_url: avatarUrl
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// GET public user profile
router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
