const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class User {
  static async create(email, password, displayName) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    try {
      const result = await pool.query(
        `INSERT INTO users (id, email, password_hash, display_name, role, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, email, display_name, role, created_at`,
        [userId, email, hashedPassword, displayName, 'customer']
      );
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw { statusCode: 400, message: 'Email already registered' };
      }
      throw error;
    }
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT id, email, display_name, role, avatar_url, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByEmail(email) {
    const result = await pool.query(
      `SELECT id, email, password_hash, display_name, role, created_at
       FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async verifyPassword(storedHash, plainPassword) {
    return bcrypt.compare(plainPassword, storedHash);
  }

  static async update(id, updates) {
    const allowedFields = ['display_name', 'avatar_url'];
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount}
       RETURNING id, email, display_name, role, avatar_url, created_at`,
      values
    );
    return result.rows[0] || null;
  }
}

module.exports = User;
