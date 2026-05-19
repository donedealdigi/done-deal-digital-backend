-- Phase 2B.1: Initial Database Schema (PostgreSQL Version)
-- Fixed for PostgreSQL compatibility

-- ===== USERS TABLE =====
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'artist', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== PRODUCTS TABLE (Merch) =====
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(100),
  price DECIMAL(10, 2) NOT NULL,
  stock_quantity INT DEFAULT 0,
  image_urls JSONB,
  specifications JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== BEATS TABLE =====
CREATE TABLE IF NOT EXISTS beats (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  producer_id UUID NOT NULL REFERENCES users(id),
  description TEXT,
  bpm INT,
  key VARCHAR(10),
  genre VARCHAR(100),
  mood JSONB,
  price DECIMAL(10, 2) NOT NULL,
  download_count INT DEFAULT 0,
  demo_url TEXT,
  stems_available BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== BEAT LICENSES TABLE =====
CREATE TABLE IF NOT EXISTS beat_licenses (
  id UUID PRIMARY KEY,
  beat_id UUID NOT NULL REFERENCES beats(id),
  license_type VARCHAR(100) CHECK (license_type IN ('non-exclusive', 'exclusive')),
  usage_rights JSONB,
  price DECIMAL(10, 2) NOT NULL,
  resale_rights BOOLEAN DEFAULT FALSE,
  max_streams INT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ORDERS TABLE =====
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  order_number VARCHAR(255) UNIQUE NOT NULL,
  items JSONB,
  total_price DECIMAL(12, 2) NOT NULL,
  total_amount DECIMAL(12, 2),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'shipped', 'delivered', 'refunded', 'confirmed')),
  payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded')),
  payment_method VARCHAR(255),
  shipping_address JSONB,
  tracking_number VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  metadata JSONB,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== PAYMENTS TABLE =====
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  payment_method_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded')),
  last_four VARCHAR(4),
  receipt_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== BEAT PURCHASES TABLE =====
CREATE TABLE IF NOT EXISTS beat_purchases (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  beat_id UUID NOT NULL REFERENCES beats(id),
  license_id UUID NOT NULL REFERENCES beat_licenses(id),
  download_count INT DEFAULT 0,
  download_links JSONB,
  expires_at TIMESTAMP,
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== CONVERSATIONS TABLE (Chatbot) =====
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  session_id VARCHAR(255) NOT NULL,
  topic VARCHAR(100),
  messages JSONB,
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== BOOKINGS TABLE =====
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY,
  service_type VARCHAR(100),
  artist_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  budget VARCHAR(100),
  timeline VARCHAR(100),
  description TEXT,
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'booked', 'completed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== INDEXES FOR PERFORMANCE =====
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);

CREATE INDEX IF NOT EXISTS idx_beats_producer ON beats(producer_id);
CREATE INDEX IF NOT EXISTS idx_beats_genre ON beats(genre);
CREATE INDEX IF NOT EXISTS idx_beats_created ON beats(created_at);

CREATE INDEX IF NOT EXISTS idx_beat_licenses_beat ON beat_licenses(beat_id);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment ON orders(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(stripe_charge_id);

CREATE INDEX IF NOT EXISTS idx_beat_purchases_user ON beat_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_beat_purchases_beat ON beat_purchases(beat_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);

CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
