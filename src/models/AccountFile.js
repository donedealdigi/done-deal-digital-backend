const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class AccountFile {
  static async create(data) {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO account_files
        (id, user_id, customer_email, s3_bucket, s3_key, filename, content_type,
         size_bytes, category, description, uploaded_by_admin_email, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        id,
        data.userId || null,
        data.customerEmail,
        data.s3Bucket || 'donedealdigital-clientfiles',
        data.s3Key,
        data.filename,
        data.contentType || null,
        data.sizeBytes || null,
        data.category || null,
        data.description || null,
        data.uploadedByAdminEmail || null
      ]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM account_files WHERE id = $1 AND deleted_at IS NULL', [id]);
    return result.rows[0] || null;
  }

  static async listForUser({ userId, customerEmail }) {
    // Match by user_id if available; otherwise fall back to customer_email
    // (so files uploaded before a customer signed up still show after they sign up).
    const result = await pool.query(
      `SELECT id, filename, content_type, size_bytes, category, description, uploaded_at, download_count
       FROM account_files
       WHERE deleted_at IS NULL
         AND (user_id = $1 OR LOWER(customer_email) = LOWER($2))
       ORDER BY uploaded_at DESC`,
      [userId || null, customerEmail || '']
    );
    return result.rows;
  }

  static async incrementDownload(id) {
    await pool.query(
      `UPDATE account_files
       SET download_count = download_count + 1, last_downloaded_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  }

  static async softDelete(id) {
    const result = await pool.query(
      `UPDATE account_files SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING s3_bucket, s3_key`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = AccountFile;
