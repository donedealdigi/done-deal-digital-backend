const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const User = require('../models/User');
const AccountFile = require('../models/AccountFile');
const S3Service = require('../services/S3Service');
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
 * Returns files the admin has uploaded for this user (or for the email
 * the user registered with). Pre-signed download URLs included.
 */
router.get('/files', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const files = await AccountFile.listForUser({
      userId: user.id,
      customerEmail: user.email
    });

    res.json({
      success: true,
      data: files.map(f => ({
        id: f.id,
        filename: f.filename,
        contentType: f.content_type,
        sizeBytes: Number(f.size_bytes) || 0,
        category: f.category,
        description: f.description,
        uploadedAt: f.uploaded_at,
        downloadCount: f.download_count,
        downloadUrl: `/api/account/files/${f.id}/download`
      }))
    });
  } catch (err) { next(err); }
});

async function resolveSignedDownload(req) {
  const user = await User.findById(req.user.id);
  if (!user) return { error: { status: 404, body: { error: 'User not found' } } };

  const file = await AccountFile.findById(req.params.id);
  if (!file) return { error: { status: 404, body: { error: 'File not found' } } };

  const isOwner = (file.user_id && file.user_id === user.id)
    || file.customer_email.toLowerCase() === user.email.toLowerCase();
  if (!isOwner && user.role !== 'admin') {
    return { error: { status: 403, body: { error: 'Not authorized to download this file' } } };
  }

  const url = await S3Service.getSignedDownloadUrl({
    bucket: file.s3_bucket,
    key: file.s3_key,
    filename: file.filename,
    expiresSec: 900
  });
  await AccountFile.incrementDownload(file.id);
  return { url, file };
}

/**
 * GET /api/account/files/:id/download-url  (JSON variant)
 * Returns { url } so the frontend can navigate the browser to it directly.
 * Preferred when calling from JS with a JWT in the Authorization header.
 */
router.get('/files/:id/download-url', async (req, res, next) => {
  try {
    const r = await resolveSignedDownload(req);
    if (r.error) return res.status(r.error.status).json(r.error.body);
    res.json({ success: true, data: { url: r.url, filename: r.file.filename } });
  } catch (err) { next(err); }
});

/**
 * GET /api/account/files/:id/download  (302 redirect variant)
 * Useful for direct browser navigation. Requires JWT in the Authorization header,
 * which means this is mainly callable via fetch+manual-redirect rather than a plain
 * link click. Most frontend code should use /download-url instead.
 */
router.get('/files/:id/download', async (req, res, next) => {
  try {
    const r = await resolveSignedDownload(req);
    if (r.error) return res.status(r.error.status).json(r.error.body);
    res.redirect(302, r.url);
  } catch (err) { next(err); }
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
