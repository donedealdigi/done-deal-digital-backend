const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const pool = require('../config/database');
const EmailService = require('../services/EmailService');
const { generateTokenPair } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const SITE_URL = process.env.SITE_URL || 'https://donedealdigital.com';
const PASSWORD_RESET_TTL_HOURS = 1;
const EMAIL_VERIFY_TTL_HOURS = 24;

// ===== Session cookie helpers (audit H-4 — JWT moved from localStorage to httpOnly cookie) =====
// Access token now flows in `ddd_session` httpOnly + Secure + SameSite=Lax
// cookie. Frontend continues to receive accessToken in JSON body too
// (transition phase 1 — backward compat with old clients still reading
// localStorage). After 30 days + frontend rollout, body-token can be
// removed in phase 3.
const PROD = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_NAME = 'ddd_session';
const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: PROD,
  sameSite: 'lax',  // lax (not strict) so payment-redirect returns keep the session
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7d matches JWT_EXPIRY
  path: '/',
  ...(PROD ? { domain: '.donedealdigital.com' } : {})  // omit in dev
};

function setSessionCookie(res, accessToken) {
  res.cookie(SESSION_COOKIE_NAME, accessToken, SESSION_COOKIE_OPTS);
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    ...(PROD ? { domain: '.donedealdigital.com' } : {})
  });
}

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

    // Access token also written to httpOnly cookie (audit H-4)
    setSessionCookie(res, accessToken);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role
      },
      accessToken  // body token kept for transition compat — frontends reading
                   // localStorage continue to work until phase 3 cleanup
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

    // Access token also written to httpOnly cookie (audit H-4)
    setSessionCookie(res, accessToken);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role
      },
      accessToken  // body token kept for transition compat
    });
  } catch (error) {
    next(error);
  }
});

// ===== LOGOUT =====
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken');
  clearSessionCookie(res);  // audit H-4 — also clear the session cookie
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

// ===== GET CURRENT USER =====
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.created_at
      }
    });
  } catch (err) { next(err); }
});

// ===== FORGOT PASSWORD =====
// POST /api/auth/forgot-password
// Body: { email }
// Always returns 200 to avoid leaking which emails are registered (timing-safe).
router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email } = req.body;
    const user = await User.findByEmail(email);

    // Always pretend success (don't reveal whether email exists)
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000);
      const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64);

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [user.id, token, expiresAt, ip || null]
      );

      const resetUrl = `${SITE_URL}/reset-password.html?token=${token}`;
      EmailService.sendMail({
        to: user.email,
        replyTo: process.env.REPLY_TO_EMAIL || 'donedealdigital@gmail.com',
        subject: 'Reset your Done Deal Digital password',
        text: `Hi ${user.display_name || ''},

Someone (hopefully you) requested a password reset for your Done Deal Digital account.

Click this link to set a new password (expires in ${PASSWORD_RESET_TTL_HOURS} hour):
${resetUrl}

If this wasn't you, ignore this email — your password won't change.

— Done Deal Digital LLC
`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:580px;margin:0 auto;background:#0a0a0a;color:#f3f3f3;border-radius:12px;overflow:hidden;">
          <div style="padding:28px;text-align:center;"><h1 style="font-size:22px;margin:0;letter-spacing:1px;color:#fff;">PASSWORD RESET</h1></div>
          <div style="padding:0 28px 28px;line-height:1.7;">
            <p>Hi ${user.display_name || ''},</p>
            <p>Someone (hopefully you) requested a password reset for your Done Deal Digital account.</p>
            <p style="text-align:center;margin:24px 0;"><a href="${resetUrl}" style="background:#e63946;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reset Password</a></p>
            <p style="color:#888;font-size:13px;">Or paste this link into your browser: ${resetUrl}</p>
            <p style="color:#888;font-size:13px;">Link expires in ${PASSWORD_RESET_TTL_HOURS} hour. If this wasn't you, ignore this email.</p>
          </div>
        </div>`
      }).catch(e => console.error('password reset email failed:', e.message));
    }

    res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (err) { next(err); }
});

// ===== RESET PASSWORD =====
// POST /api/auth/reset-password
// Body: { token, password }
router.post('/reset-password', [
  body('token').isLength({ min: 32 }),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { token, password } = req.body;

    const tokenRow = await pool.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token = $1`,
      [token]
    );
    const row = tokenRow.rows[0];
    if (!row) return res.status(400).json({ error: 'Invalid or expired token' });
    if (row.used_at) return res.status(400).json({ error: 'Token already used' });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Token expired' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hash, row.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) { next(err); }
});

// ===== EMAIL VERIFICATION =====
// GET /api/auth/verify-email?token=...
router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('<h1>Missing token</h1>');

    const result = await pool.query(
      `SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token = $1`,
      [token]
    );
    const row = result.rows[0];
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      return res.status(400).send(`<!doctype html><html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:2rem;"><div><h1>Link expired or invalid</h1><p><a href="${SITE_URL}" style="color:#e63946;">Back to donedealdigital.com</a></p></div></body></html>`);
    }
    await pool.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = $1', [row.user_id]);
    await pool.query('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);
    res.send(`<!doctype html><html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:2rem;"><div><h1>Email verified ✓</h1><p>Thanks for confirming your address.</p><p><a href="${SITE_URL}" style="color:#e63946;">Back to donedealdigital.com</a></p></div></body></html>`);
  } catch (err) { next(err); }
});

module.exports = router;
