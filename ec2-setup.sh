#!/bin/bash
set -e

# Done Deal Digital - EC2 Instance Setup Script
# Runs on instance launch to configure Node.js application server

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Get environment variables from user data
AWS_REGION="${aws_region}"
DB_SECRET_ARN="${db_secret}"
INSTANCE_ID=$(ec2-metadata --instance-id | cut -d " " -f 2)

log_info "Starting EC2 instance setup for Done Deal Digital"
log_info "Region: $AWS_REGION"
log_info "Instance ID: $INSTANCE_ID"

# Update system
log_info "Updating system packages..."
yum update -y || log_error "Failed to update system"
log_success "System packages updated"

# Install Node.js (use Amazon Linux 2 native package, compatible with glibc 2.26)
log_info "Installing Node.js..."

# Remove any problematic external repos that might interfere
log_info "Cleaning up external package repos..."
rm -f /etc/yum.repos.d/nodesource* 2>/dev/null || true
yum clean all 2>/dev/null || true

# Amazon Linux 2 native nodejs package - no external repo needed
log_info "Installing nodejs14 from amazon-linux-extras..."
if amazon-linux-extras install -y nodejs14; then
  log_success "nodejs14 installed successfully"
elif amazon-linux-extras install -y nodejs12; then
  log_warn "nodejs14 not available, installed nodejs12 instead"
else
  log_error "Failed to install Node.js from amazon-linux-extras"
fi

# Verify installation
if ! node --version &> /dev/null; then
  log_error "Node.js installation verification failed"
fi

log_success "Node.js installed: $(node -v)"
log_success "npm installed: $(npm -v)"

# Install PostgreSQL client
log_info "Installing PostgreSQL client..."
yum install -y postgresql15-contrib || log_error "Failed to install PostgreSQL client"
log_success "PostgreSQL client installed"

# Install Git
log_info "Installing Git..."
yum install -y git || log_error "Failed to install Git"
log_success "Git installed: $(git --version)"

# Install Nginx
log_info "Installing Nginx..."
yum install -y nginx || log_error "Failed to install Nginx"
log_success "Nginx installed: $(nginx -v 2>&1)"

# Install AWS CLI v2
log_info "Installing AWS CLI v2..."
yum install -y awscliv2 || log_error "Failed to install AWS CLI"
log_success "AWS CLI installed"

# Install CloudWatch agent
log_info "Installing CloudWatch agent..."
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm || log_error "Failed to install CloudWatch agent"
log_success "CloudWatch agent installed"

# Create application directory
log_info "Creating application directory..."
mkdir -p /opt/done-deal-digital
mkdir -p /var/log/done-deal-digital
chown -R ec2-user:ec2-user /opt/done-deal-digital
chown -R ec2-user:ec2-user /var/log/done-deal-digital
log_success "Application directory created"

# Retrieve database credentials from Secrets Manager
log_info "Retrieving database credentials from Secrets Manager..."
DB_CREDENTIALS=$(aws secretsmanager get-secret-value \
  --secret-id "$DB_SECRET_ARN" \
  --region "$AWS_REGION" \
  --query SecretString \
  --output text) || log_error "Failed to retrieve database credentials"

# Parse credentials
DB_HOST=$(echo $DB_CREDENTIALS | jq -r '.host')
DB_PORT=$(echo $DB_CREDENTIALS | jq -r '.port')
DB_NAME=$(echo $DB_CREDENTIALS | jq -r '.dbname')
DB_USER=$(echo $DB_CREDENTIALS | jq -r '.username')
DB_PASSWORD=$(echo $DB_CREDENTIALS | jq -r '.password')

log_info "Database configuration retrieved"
log_info "Database Host: $DB_HOST"
log_info "Database Port: $DB_PORT"
log_info "Database Name: $DB_NAME"

# Download application code from S3
log_info "Downloading application code from S3..."
cd /opt/done-deal-digital
aws s3 cp s3://done-deal-digital-prod/backend-code/ddd-backend.tar.gz /tmp/ddd-backend.tar.gz --region "$AWS_REGION" || log_error "Failed to download code from S3"
tar -xzf /tmp/ddd-backend.tar.gz -C /opt/done-deal-digital || log_error "Failed to extract code archive"
rm /tmp/ddd-backend.tar.gz
chown -R ec2-user:ec2-user /opt/done-deal-digital
log_success "Application code deployed from S3"

# Install Node.js dependencies
log_info "Installing Node.js dependencies..."
cd /opt/done-deal-digital
npm ci --production || log_error "Failed to install dependencies"
log_success "Dependencies installed"

# Create environment file
log_info "Creating environment configuration..."
cat > /opt/done-deal-digital/.env.production << EOF
# Database Configuration
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

# Application Configuration
NODE_ENV=production
PORT=5000
LOG_LEVEL=info

# AWS Configuration
AWS_REGION=${AWS_REGION}
AWS_S3_BUCKET=done-deal-digital-prod

# Security
# JWT_SECRET=<will be set by application startup script>
# STRIPE_SECRET_KEY=<will be set by application startup script>
# PAYPAL_CLIENT_ID=<will be set by application startup script>

# Monitoring
ENABLE_CLOUDWATCH_LOGS=true
INSTANCE_ID=${INSTANCE_ID}
EOF

chown ec2-user:ec2-user /opt/done-deal-digital/.env.production
chmod 600 /opt/done-deal-digital/.env.production
log_success "Environment file created"

# Run database migrations
log_info "Running database migrations..."
cd /opt/done-deal-digital
if [ -f "database-init.sql" ]; then
  PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f database-init.sql || log_warn "Database initialization script failed (may already be initialized)"
else
  log_warn "database-init.sql not found, skipping migrations"
fi

# Create systemd service file
log_info "Creating systemd service..."
cat > /etc/systemd/system/done-deal-digital.service << 'SYSTEMD'
[Unit]
Description=Done Deal Digital Backend Service
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/done-deal-digital
EnvironmentFile=/opt/done-deal-digital/.env.production
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ddd-backend

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
log_success "Systemd service created"

# Configure Nginx as reverse proxy
log_info "Configuring Nginx..."
cat > /etc/nginx/conf.d/done-deal-digital.conf << 'NGINX'
upstream app_backend {
    server 127.0.0.1:5000;
    keepalive 32;
}

server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 10M;

    # Logging
    access_log /var/log/nginx/done-deal-digital-access.log;
    error_log /var/log/nginx/done-deal-digital-error.log warn;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy settings
    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /api/health {
        access_log off;
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
NGINX

# Test Nginx configuration
nginx -t || log_error "Nginx configuration test failed"
systemctl enable nginx
systemctl start nginx
log_success "Nginx configured and started"

# Configure CloudWatch agent
log_info "Configuring CloudWatch agent..."
cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json << 'CWCONFIG'
{
  "metrics": {
    "namespace": "DoneDealDigital/EC2",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_IDLE",
            "unit": "Percent"
          },
          "cpu_usage_iowait",
          "cpu_usage_system",
          "cpu_usage_active"
        ],
        "metrics_collection_interval": 60,
        "aggregation_dimensions": [["InstanceId"]]
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "MEM_USED_PERCENT",
            "unit": "Percent"
          },
          "mem_available",
          "mem_used"
        ],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "DISK_USED_PERCENT",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60,
        "resources": ["/"]
      }
    },
    "append_dimensions": {
      "InstanceId": "$${aws:InstanceId}",
      "Environment": "production",
      "Service": "done-deal-digital-backend"
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/done-deal-digital/application.log",
            "log_group_name": "/aws/done-deal-digital/backend/application",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 30,
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          },
          {
            "file_path": "/var/log/done-deal-digital/error.log",
            "log_group_name": "/aws/done-deal-digital/backend/errors",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 30
          },
          {
            "file_path": "/var/log/nginx/done-deal-digital-access.log",
            "log_group_name": "/aws/done-deal-digital/nginx/access",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 7
          },
          {
            "file_path": "/var/log/nginx/done-deal-digital-error.log",
            "log_group_name": "/aws/done-deal-digital/nginx/error",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 7
          }
        ]
      }
    }
  }
}
CWCONFIG

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json || log_warn "CloudWatch agent configuration failed"

log_success "CloudWatch agent configured"

# Start application service
log_info "Starting application service..."
systemctl enable done-deal-digital
systemctl start done-deal-digital
sleep 5

# Check if service is running
if systemctl is-active --quiet done-deal-digital; then
  log_success "Application service started successfully"
else
  log_error "Application service failed to start"
fi

# Verify health check endpoint
log_info "Verifying health check endpoint..."
for i in {1..30}; do
  if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    log_success "Health check endpoint responding"
    break
  fi
  if [ $i -eq 30 ]; then
    log_warn "Health check endpoint not responding after 30 attempts"
  fi
  sleep 1
done

log_success "EC2 instance setup completed successfully!"
log_info "Application is running and available at http://localhost:5000"
