#!/bin/bash

# Done Deal Digital - EC2 Instance Setup Script
# Run this on a fresh EC2 instance to set up the environment

set -e

echo "🔧 Setting up EC2 instance for Done Deal Digital Backend..."

# Update system
echo "📦 Updating system packages..."
sudo yum update -y

# Install Node.js
echo "📦 Installing Node.js..."
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PostgreSQL client (for database management)
echo "📦 Installing PostgreSQL client..."
sudo yum install -y postgresql

# Install Git
echo "📦 Installing Git..."
sudo yum install -y git

# Install Nginx (reverse proxy)
echo "📦 Installing Nginx..."
sudo yum install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Create deployment directory
echo "📁 Creating deployment directory..."
DEPLOY_PATH="/opt/done-deal-digital-backend"
sudo mkdir -p $DEPLOY_PATH
sudo chown ec2-user:ec2-user $DEPLOY_PATH

# Create systemd service file
echo "⚙️  Creating systemd service..."
sudo tee /etc/systemd/system/done-deal-digital-backend.service > /dev/null << 'EOF'
[Unit]
Description=Done Deal Digital Backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/done-deal-digital-backend
EnvironmentFile=/etc/done-deal-digital/env-vars
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Create environment variables directory
echo "🔐 Setting up environment variables..."
sudo mkdir -p /etc/done-deal-digital
sudo touch /etc/done-deal-digital/env-vars
sudo chown root:root /etc/done-deal-digital/env-vars
sudo chmod 600 /etc/done-deal-digital/env-vars

echo "📝 Add the following to /etc/done-deal-digital/env-vars:"
cat << 'EOF'
export NODE_ENV=production
export PORT=5000
export DB_HOST=your-rds-host
export DB_PORT=5432
export DB_NAME=done_deal_digital_prod
export DB_USER=your-db-user
export DB_PASSWORD=your-db-password
export JWT_SECRET=your-jwt-secret
export JWT_REFRESH_SECRET=your-jwt-refresh-secret
export STRIPE_SECRET_KEY_PROD=sk_live_...
export STRIPE_PUBLISHABLE_KEY_PROD=pk_live_...
export STRIPE_WEBHOOK_SECRET_PROD=whsec_...
export PAYPAL_CLIENT_ID_PROD=your-paypal-client-id
export PAYPAL_CLIENT_SECRET_PROD=your-paypal-client-secret
export SENDGRID_API_KEY=your-sendgrid-key
export AWS_REGION=us-west-2
EOF

# Configure Nginx as reverse proxy
echo "🌐 Configuring Nginx..."
sudo tee /etc/nginx/conf.d/done-deal-digital.conf > /dev/null << 'EOF'
upstream backend {
  server 127.0.0.1:5000;
}

server {
  listen 80;
  server_name done-deal-backend.donedealdigital.com;

  # Redirect HTTP to HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name done-deal-backend.donedealdigital.com;

  # SSL certificates (use Let's Encrypt via certbot)
  ssl_certificate /etc/letsencrypt/live/done-deal-backend.donedealdigital.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/done-deal-backend.donedealdigital.com/privkey.pem;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-XSS-Protection "1; mode=block" always;

  # Proxy settings
  location / {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }

  # Health check endpoint
  location /api/health {
    proxy_pass http://backend;
    access_log off;
  }
}
EOF

# Validate Nginx configuration
echo "✅ Validating Nginx configuration..."
sudo nginx -t

# Set up SSL certificates with Let's Encrypt
echo "🔒 Installing Certbot for SSL..."
sudo yum install -y certbot python3-certbot-nginx

echo "⚠️  Manual step: Run the following command to set up SSL certificates:"
echo "   sudo certbot certonly --standalone -d done-deal-backend.donedealdigital.com"

# Reload systemd
echo "⚙️  Reloading systemd daemon..."
sudo systemctl daemon-reload

# Create log directory
echo "📋 Setting up logging..."
sudo mkdir -p /var/log/done-deal-digital
sudo chown ec2-user:ec2-user /var/log/done-deal-digital

# Set up log rotation
sudo tee /etc/logrotate.d/done-deal-digital > /dev/null << 'EOF'
/var/log/done-deal-digital/*.log {
  daily
  rotate 7
  compress
  delaycompress
  notifempty
  create 0640 ec2-user ec2-user
  sharedscripts
  postrotate
    systemctl reload done-deal-digital-backend > /dev/null 2>&1 || true
  endscript
}
EOF

# CloudWatch monitoring (optional)
echo "📊 Setting up CloudWatch monitoring..."
echo "   Manual step: Install CloudWatch agent for log streaming"

echo ""
echo "✅ EC2 instance setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update environment variables in /etc/done-deal-digital/env-vars"
echo "2. Set up SSL certificates with: sudo certbot certonly --standalone -d done-deal-backend.donedealdigital.com"
echo "3. Clone the backend repo: git clone https://github.com/yourusername/done-deal-digital-backend.git"
echo "4. Start the service: sudo systemctl start done-deal-digital-backend"
echo "5. Enable on boot: sudo systemctl enable done-deal-digital-backend"
