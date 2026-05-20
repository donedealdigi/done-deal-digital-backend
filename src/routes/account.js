const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// All account routes require auth
router.use(authenticate);

/**
 * GET /api/account/me
 * Returns the current user's profile.
 */
router.get('/me', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      success: true,
      data: {
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

/**
 * PUT /api/account/me
 * Update display_name, avatar_url
 */
router.put('/me', async (req, res, next) => {
  try {
    const { displayName, avatarUrl } = req.body || {};
    const updated = await User.update(req.user.id, {
      display_name: displayName,
      avatar_url: avatarUrl
    });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

/**
 * GET /api/account/orders
 * Returns all service deposits + merch orders linked to the user's email.
 * Both tables are keyed by customer_email; we join by the authenticated user's email.
 */
router.get('/orders', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [deposits, merch] = await Promise.all([
      pool.query(
        `SELECT id, service_name, deposit_type, amount, currency, status,
                stripe_payment_intent_id, paypal_order_id, payment_provider,
                notes, created_at, paid_at
         FROM service_deposits
         WHERE customer_email = $1
         ORDER BY created_at DESC`,
        [user.email]
      ),
      pool.query(
        `SELECT id, items, subtotal, shipping_cost, tax, total, currency, status,
                stripe_payment_intent_id, printful_order_id, tracking_number, tracking_url,
                created_at, paid_at, submitted_at, fulfilled_at
         FROM merch_orders
         WHERE customer_email = $1
         ORDER BY created_at DESC`,
        [user.email]
      )
    ]);

    res.json({
      success: true,
      data: {
        deposits: deposits.rows.map(r => ({
          ...r,
          type: 'service_deposit'
        })),
        merchOrders: merch.rows.map(r => ({
          ...r,
          type: 'merch_order'
        })),
        totalCount: deposits.rows.length + merch.rows.length
      }
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/account/files
 * Returns files associated with this user. (Empty for now; admin upload UI is Phase 3b.)
 */
router.get('/files', async (req, res) => {
  res.json({
    success: true,
    data: [],
    note: 'File library coming soon. Files we deliver to you (stems, masters, mixes, design assets) will appear here for download.'
  });
});

/**
 * GET /api/account/sessions
 * Returns booked discovery calls / studio sessions.
 * Currently returns a placeholder pointing customers at Google Calendar appointment schedule.
 * Future: connect to Google Calendar API to pull real bookings made under the customer's email.
 */
router.get('/sessions', async (req, res) => {
  res.json({
    success: true,
    data: [],
    bookingUrl: 'https://calendar.app.google/1oez3LMbL2HB5HCL6',
    note: 'Booked sessions will appear here once Google Calendar integration is connected. For now, book a session via the link or the "Book a Call" section on donedealdigital.com.'
  });
});

/**
 * GET /api/account/invoices
 * Returns invoices for the user. Currently no invoice system; placeholder.
 */
router.get('/invoices', async (req, res) => {
  res.json({
    success: true,
    data: [],
    note: 'Invoices for multi-stage projects will appear here. Single deposits and merch orders are listed under Orders.'
  });
});

module.exports = router;
