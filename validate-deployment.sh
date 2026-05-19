#!/bin/bash

# Done Deal Digital - Deployment Validation Script
# Checks all prerequisites before deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Functions
check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASSED++))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAILED++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARNINGS++))
}

print_section() {
  echo ""
  echo -e "${BLUE}=== $1 ===${NC}"
}

# Main validation

print_section "System Requirements"

# Check AWS CLI
if command -v aws &> /dev/null; then
  check_pass "AWS CLI installed"
else
  check_fail "AWS CLI not installed"
fi

# Check Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  check_pass "Node.js installed ($NODE_VERSION)"
else
  check_fail "Node.js not installed"
fi

# Check npm
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm -v)
  check_pass "npm installed ($NPM_VERSION)"
else
  check_fail "npm not installed"
fi

# Check Git
if command -v git &> /dev/null; then
  check_pass "Git installed"
else
  check_fail "Git not installed"
fi

# Check Terraform (optional but recommended)
if command -v terraform &> /dev/null; then
  check_pass "Terraform installed"
else
  check_warn "Terraform not installed (recommended for IaC)"
fi

print_section "AWS Configuration"

# Check AWS credentials
if aws sts get-caller-identity &> /dev/null; then
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  check_pass "AWS credentials configured (Account: $ACCOUNT_ID)"
else
  check_fail "AWS credentials not configured"
fi

# Check AWS region
AWS_REGION=${AWS_REGION:-us-west-2}
check_pass "AWS region set to: $AWS_REGION"

# Check IAM permissions
if aws iam get-user &> /dev/null; then
  check_pass "IAM user accessible"
else
  check_warn "IAM user not accessible (might be role-based)"
fi

print_section "Application Files"

# Check essential files
ESSENTIAL_FILES=(
  "package.json"
  "src/app.js"
  "ec2-setup.sh"
  "database-init.sql"
  "AWS_INFRASTRUCTURE.md"
)

for file in "${ESSENTIAL_FILES[@]}"; do
  if [ -f "$file" ]; then
    check_pass "$file exists"
  else
    check_fail "$file missing"
  fi
done

# Check node_modules
if [ -d "node_modules" ]; then
  check_pass "Dependencies installed"
else
  check_warn "Dependencies not installed (run: npm install)"
fi

print_section "Environment Configuration"

# Check environment variables file
if [ -f ".env" ] || [ -f ".env.production" ]; then
  check_pass "Environment file exists"
else
  check_warn "Environment file not found (create .env.production)"
fi

# Check for required env vars in code
required_env_vars=(
  "DATABASE_URL"
  "JWT_SECRET"
  "STRIPE_SECRET_KEY"
  "PAYPAL_CLIENT_ID"
)

if [ -f ".env" ] || [ -f ".env.production" ]; then
  for var in "${required_env_vars[@]}"; do
    if grep -q "$var" .env* 2>/dev/null; then
      check_pass "Environment variable $var configured"
    else
      check_warn "Environment variable $var not found"
    fi
  done
fi

print_section "AWS Resources"

# Check if VPC exists
if aws ec2 describe-vpcs --filters "Name=tag:Name,Values=ddd-vpc" --query 'Vpcs[0].VpcId' --output text &> /dev/null; then
  VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=ddd-vpc" --query 'Vpcs[0].VpcId' --output text)
  check_pass "VPC exists (ID: $VPC_ID)"
else
  check_warn "VPC 'ddd-vpc' not found (needs to be created)"
fi

# Check if RDS instance exists
if aws rds describe-db-instances --query "DBInstances[?contains(DBInstanceIdentifier, 'ddd-prod')].[DBInstanceIdentifier]" --output text &> /dev/null 2>&1; then
  check_pass "RDS instance found"
else
  check_warn "RDS instance 'ddd-prod' not found (needs to be created)"
fi

# Check if S3 bucket exists
if aws s3api head-bucket --bucket done-deal-digital-prod &> /dev/null; then
  check_pass "S3 bucket 'done-deal-digital-prod' exists"
else
  check_warn "S3 bucket 'done-deal-digital-prod' not found (needs to be created)"
fi

# Check if IAM role exists
if aws iam get-role --role-name ddd-ec2-role &> /dev/null; then
  check_pass "IAM role 'ddd-ec2-role' exists"
else
  check_warn "IAM role 'ddd-ec2-role' not found (needs to be created)"
fi

# Check if security groups exist
if aws ec2 describe-security-groups --filters "Name=group-name,Values=ddd-backend-sg" --query 'SecurityGroups[0].GroupId' --output text &> /dev/null; then
  check_pass "Backend security group exists"
else
  check_warn "Backend security group 'ddd-backend-sg' not found"
fi

print_section "Database Connectivity"

# Check database connection (if DB exists)
if [ ! -z "$DB_HOST" ]; then
  if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &> /dev/null; then
    check_pass "Database connection successful"
  else
    check_warn "Database connection failed (may not be deployed yet)"
  fi
else
  check_warn "DB_HOST not set, skipping database check"
fi

print_section "Dependencies Check"

# Check critical npm dependencies
critical_deps=(
  "express"
  "pg"
  "jsonwebtoken"
  "stripe"
)

if [ -f "package.json" ]; then
  for dep in "${critical_deps[@]}"; do
    if grep -q "\"$dep\"" package.json; then
      check_pass "Dependency '$dep' in package.json"
    else
      check_fail "Dependency '$dep' missing from package.json"
    fi
  done
fi

print_section "Security Checks"

# Check for secrets in git
if git rev-parse --git-dir > /dev/null 2>&1; then
  if git log --oneline --all | grep -i "secret\|password\|key" &> /dev/null; then
    check_warn "Possible secrets in git history"
  else
    check_pass "No obvious secrets in git history"
  fi
fi

# Check .gitignore
if grep -q ".env" .gitignore 2>/dev/null; then
  check_pass ".env file in .gitignore"
else
  check_fail ".env file not in .gitignore"
fi

print_section "Configuration Files"

# Check deployment configs
config_files=(
  "deployment.config.js"
  "iam-role-policy.json"
  "cloudwatch-monitoring.yaml"
  "terraform-vpc.tf"
)

for file in "${config_files[@]}"; do
  if [ -f "$file" ]; then
    check_pass "$file exists"
  else
    check_warn "$file not found"
  fi
done

print_section "Validation Summary"

echo ""
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo -e "${RED}❌ Deployment validation failed!${NC}"
  echo "Please resolve the failed items above before deploying."
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}⚠️  Deployment can proceed but some items need attention${NC}"
  echo "Review the warnings above and address them if needed."
  exit 0
else
  echo ""
  echo -e "${GREEN}✅ All validation checks passed!${NC}"
  echo "Ready for deployment."
  exit 0
fi
