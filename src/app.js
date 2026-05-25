require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const beatRoutes = require('./routes/beats');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const merchRoutes = require('./routes/merch');
const newsletterRoutes = require('./routes/newsletter');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');
const downloadRoutes = require('./routes/downloads');
const chatRoutes = require('./routes/chat');
const internshipRoutes = require('./routes/internship');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

const app = express();

// Behind ALB → need to trust X-Forwarded-For so rate limiting + logging
// see real client IPs instead of the load balancer IP.
app.set('trust proxy', 1);

// ===== SECURITY & MIDDLEWARE =====
app.use(helmet());

// ===== RATE LIMITING (per security audit 2026-05-25 H-2) =====
// Strict limiter for auth endpoints (login, register, password reset).
// 5 attempts per 15 min per IP. Defends against brute force / credential
// stuffing. Skips successful requests so legitimate users aren't penalized.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many auth attempts. Please try again in 15 minutes.' }
});

// Moderate limiter for payment endpoints (intent creation, capture).
// 20 requests per 15 min per IP. Webhook endpoints are exempted via
// the `skip` predicate below (Stripe + PayPal need to retry on transient
// failures and shouldn't be rate-limited).
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => /\/webhook($|\/)/.test(req.path),
  message: { error: 'Too many payment requests. Please try again shortly.' }
});

// Form-style limiter for newsletter signup, internship apps, contact forms.
// 5 per hour per IP — generous for legit users, blocks spam bots.
const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again later.' }
});

// Global limiter for everything else under /api. 100 per 15 min per IP.
// Skips health check + webhook endpoints so ALB and Stripe/PayPal never
// get rate-limited.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || /\/webhook($|\/)/.test(req.path)
});

// CORS: allow the canonical site (with and without www), staging, and local dev.
// Extra origins can be added via the FRONTEND_URL env var (comma-separated).
const ALLOWED_ORIGINS = new Set([
  'https://donedealdigital.com',
  'https://www.donedealdigital.com',
  'https://staging.donedealdigital.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  ...(process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean)
]);

app.use(cors({
  origin: (origin, callback) => {
    // Allow no-origin requests (curl, server-to-server, health checks)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, origin);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// ALB Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// ===== API ROUTES =====
// Global API rate limiter applies first to ALL /api/* routes (skips
// /api/health and *webhook* endpoints — see apiLimiter.skip predicate).
app.use('/api', apiLimiter);

// Targeted limiters layer on top for sensitive endpoints.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/payments', paymentLimiter);
app.use('/api/newsletter', formLimiter);
app.use('/api/internship', formLimiter);
app.use('/api/chat', formLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/beats', beatRoutes);
app.use('/api/orders', authenticate, orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/merch', merchRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/internship', internshipRoutes);

// ===== ADMIN ROUTES (Protected) =====
app.use('/api/admin', authenticate, (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ===== ERROR HANDLER =====
app.use(errorHandler);

// ===== SERVER STARTUP =====
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';

const server = app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Done Deal Digital Backend`);
  console.log(`📡 Server running at http://${HOST}:${PORT}`);
  console.log(`🔌 Environment: ${process.env.NODE_ENV}`);
  console.log(`\n✅ Health check: http://${HOST}:${PORT}/health\n`);

  // Abandoned-cart recovery — periodic background sweep.
  try {
    require('./services/AbandonedCartService').startScheduler();
  } catch (e) {
    console.error('Failed to start abandoned-cart scheduler:', e.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = app;
