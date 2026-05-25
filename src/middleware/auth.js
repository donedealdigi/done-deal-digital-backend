const { verifyAccessToken } = require('../utils/jwt');

// Audit H-4 — auth now prefers the httpOnly `ddd_session` cookie (XSS-safe)
// and falls back to legacy `Authorization: Bearer ...` header so existing
// localStorage-token clients keep working through the transition period.
// Phase 3 cleanup (~30 days after frontend rolls out) drops the header fallback.
const authenticate = (req, res, next) => {
  const token = req.cookies?.ddd_session
             || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
};

const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize
};
