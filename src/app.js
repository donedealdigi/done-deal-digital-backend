require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

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

// ===== SECURITY & MIDDLEWARE =====
app.use(helmet());

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
