const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateTokenPair } = require('../utils/jwt');

const router = express.Router();

// ===== REGISTER =====
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('displayName').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, displayName } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const user = await User.create(email, password, displayName);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user.id, user.role);

    // Set refresh token in httpOnly cookie (secure by default in production)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role
      },
      accessToken
    });
  } catch (error) {
    next(error);
  }
});

// ===== LOGIN =====
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValid = await User.verifyPassword(user.password_hash, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user.id, user.role);

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role
      },
      accessToken
    });
  } catch (error) {
    next(error);
  }
});

// ===== LOGOUT =====
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
});

// ===== REFRESH TOKEN =====
router.post('/refresh', (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    // In production, verify refresh token here
    // For now, this is a placeholder
    res.json({ message: 'Token refreshed' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
