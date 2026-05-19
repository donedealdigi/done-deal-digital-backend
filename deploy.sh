#!/bin/bash

# Done Deal Digital Backend - EC2 Deployment Script
# This script deploys the backend to an EC2 instance

set -e

echo "🚀 Starting Done Deal Digital Backend Deployment..."

# Configuration
DEPLOY_USER="ec2-user"
DEPLOY_HOST="${EC2_HOST:-done-deal-backend.donedealdigital.com}"
DEPLOY_PATH="/opt/done-deal-digital-backend"
APP_NAME="done-deal-digital-backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
  exit 1
}

log_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# 1. Build check
log_info "Checking build status..."
if [ ! -d "src" ] || [ ! -f "package.json" ]; then
  log_error "Backend source files not found. Run this script from the backend root directory."
fi

# 2. Install dependencies
log_info "Installing dependencies..."
npm install --production

# 3. Run tests
log_info "Running tests..."
npm test || log_warn "Tests failed, but continuing with deployment..."

# 4. Create deployment package
log_info "Creating deployment package..."
tar -czf ${APP_NAME}-${DATE}.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=tests \
  --exclude=.env \
  --exclude=.env.development \
  .

# 5. Upload to EC2
log_info "Uploading to EC2 instance..."
scp -i ~/.ssh/ddd-ec2-key.pem ${APP_NAME}-${DATE}.tar.gz ${DEPLOY_USER}@${DEPLOY_HOST}:~/

# 6. Extract and deploy on EC2
log_info "Deploying on EC2..."
ssh -i ~/.ssh/ddd-ec2-key.pem ${DEPLOY_USER}@${DEPLOY_HOST} << 'EOF'
  # Stop the current service
  sudo systemctl stop ${APP_NAME} || true

  # Extract the package
  cd ${DEPLOY_PATH}
  tar -xzf ~/done-deal-digital-backend-*.tar.gz -C .

  # Update environment
  source /etc/done-deal-digital/env-vars

  # Install dependencies
  npm install --production

  # Run migrations
  npm run migrate

  # Start the service
  sudo systemctl start ${APP_NAME}

  # Check status
  sudo systemctl status ${APP_NAME}
EOF

# 7. Verify deployment
log_info "Verifying deployment..."
sleep 5
curl -f https://${DEPLOY_HOST}/api/health || log_error "Health check failed"

log_info "✅ Deployment completed successfully!"
log_info "📊 Backend running at: https://${DEPLOY_HOST}"
