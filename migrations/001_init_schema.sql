-- Phase 2B.1: Initial Database Schema
-- Run this migration to create core tables

-- ===== USERS TABLE =====
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'artist', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slug (slug),
  INDEX idx_category (category)
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_producer (producer_id),
  INDEX idx_genre (genre)
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_beat (beat_id)
);

-- ===== ORDERS TABLE =====
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  order_number VARCHAR(255) UNIQUE NOT NULL,
  items JSONB NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'shipped', 'delivered', 'refunded')),
  payment_method VARCHAR(255),
  shipping_address JSONB,
  tracking_number VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_order_number (order_number)
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
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_beat (beat_id)
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_session (session_id)
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_email (email)
);

-- ===== INDEXES FOR PERFORMANCE =====
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_beats_created ON beats(created_at);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
