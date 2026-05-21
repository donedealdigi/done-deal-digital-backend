const express = require('express');
const multer = require('multer');
const router = express.Router();
const User = require('../models/User');
const AccountFile = require('../models/AccountFile');
const S3Service = require('../services/S3Service');
const { authenticate, authorize } = require('../middleware/auth');

// All admin routes require admin role
router.use(authenticate);
router.use(authorize(['admin']));

// 500 MB max upload — generous for stem packs / wav masters
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }
});

/**
 * POST /api/admin/files/upload
 * multipart/form-data:
 *   - file (binary)
 *   - customerEmail (string, required)
 *   - category (string, optional: e.g. "stems", "master", "mix", "design")
 *   - description (string, optional)
 *
 * Uploads the file to S3 under users/<email>/<date>/... and creates an
 * account_files row so the customer's portal shows it.
 */
router.post('/files/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'file required (multipart form field "file")' });
    }
    const { customerEmail, category, description } = req.body;
    if (!customerEmail || !customerEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'customerEmail required' });
    }

    // Look up the user if they've already signed up; otherwise the file
    // is still associated by email and will appear when they sign up later.
    const user = await User.findByEmail(customerEmail.toLowerCase());

    const uploadResult = await S3Service.uploadBuffer({
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      customerEmail,
      filename: req.file.originalname
    });

    const fileRow = await AccountFile.create({
      userId: user ? user.id : null,
      customerEmail: customerEmail.toLowerCase(),
      s3Bucket: uploadResult.bucket,
      s3Key: uploadResult.key,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      sizeBytes: uploadResult.size,
      category: category || null,
      description: description || null,
      uploadedByAdminEmail: req.user.email || null
    });

    res.status(201).json({
      success: true,
      data: {
        id: fileRow.id,
        filename: fileRow.filename,
        sizeBytes: Number(fileRow.size_bytes),
        s3Key: fileRow.s3_key,
        linkedToUser: !!user,
        customerEmail: fileRow.customer_email
      }
    });
  } catch (err) {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: 'File too large (max 500 MB)' });
    }
    console.error('Admin file upload error:', err.message);
    next(err);
  }
});

/**
 * DELETE /api/admin/files/:id
 * Soft-deletes the file row and removes the underlying S3 object.
 */
router.delete('/files/:id', async (req, res, next) => {
  try {
    const deleted = await AccountFile.softDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Not found' });
    try {
      await S3Service.deleteObject({ bucket: deleted.s3_bucket, key: deleted.s3_key });
    } catch (e) {
      console.error('S3 delete failed (DB row already marked deleted):', e.message);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/files
 * List all files (admin only) for inspection / debugging.
 */
router.get('/files', async (req, res, next) => {
  try {
    const pool = require('../config/database');
    const r = await pool.query(
      `SELECT id, customer_email, filename, size_bytes, category, uploaded_at, uploaded_by_admin_email
       FROM account_files
       WHERE deleted_at IS NULL
       ORDER BY uploaded_at DESC
       LIMIT 200`
    );
    res.json({ success: true, data: r.rows });
  } catch (err) { next(err); }
});

module.exports = router;
