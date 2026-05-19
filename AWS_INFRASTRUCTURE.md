# Done Deal Digital - AWS Infrastructure Setup

## Overview
This document outlines the AWS infrastructure required to run the Done Deal Digital backend in production.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Internet (HTTPS)                      │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                Route 53 (DNS)                            │
│         done-deal-backend.donedealdigital.com           │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│              CloudFront (CDN)                            │
│         Caching & DDoS Protection                        │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│         Application Load Balancer (ALB)                  │
│              (Port 443 SSL/TLS)                          │
└────────────────────────────┬────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼──┐          ┌────▼──┐          ┌────▼──┐
    │ EC2   │          │ EC2   │          │ EC2   │
    │Instance│  (ASG)  │Instance│          │Instance│
    │1      │          │2      │          │3      │
    └────┬──┘          └────┬──┘          └────┬──┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │  RDS PostgreSQL            │
              │  (Multi-AZ Replication)    │
              │  done_deal_digital_prod    │
              └──────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼──┐      ┌────▼──┐      ┌────▼──┐
    │ S3    │      │CloudWatch  │ Backup │
    │ Files │      │ Monitoring │ Vault  │
    └───────┘      └───────────┘      └───────┘
```

## AWS Resources

### 1. Compute

#### EC2 Auto Scaling Group
- **Instance Type**: t3.medium (2 vCPU, 4 GB RAM)
- **AMI**: Amazon Linux 2
- **Min/Max Instances**: 2 / 4 (Scale based on CPU/Memory)
- **Key Pair**: `ddd-ec2-key.pem`
- **Security Group**: `ddd-backend-sg`
  - Inbound:
    - Port 80 (HTTP) → from ALB
    - Port 443 (HTTPS) → from ALB
    - Port 22 (SSH) → from your IP (restricted)
  - Outbound: All traffic

#### Application Load Balancer
- **Name**: `ddd-backend-alb`
- **Scheme**: Internet-facing
- **Protocol**: HTTPS (Port 443)
- **Certificate**: ACM certificate for `done-deal-backend.donedealdigital.com`
- **Health Check**:
  - Path: `/api/health`
  - Port: 5000
  - Protocol: HTTP
  - Healthy Threshold: 2
  - Unhealthy Threshold: 3
  - Timeout: 5 seconds
  - Interval: 30 seconds

### 2. Database

#### RDS PostgreSQL
- **Instance Class**: db.t3.small
- **Engine**: PostgreSQL 14
- **Storage**: 100 GB (General Purpose SSD)
- **Multi-AZ**: Enabled (for high availability)
- **Backup Retention**: 30 days
- **Database Name**: `done_deal_digital_prod`
- **Master User**: `dddigital_prod`
- **Subnet Group**: `ddd-db-subnet-group` (private subnets)
- **Security Group**: `ddd-db-sg`
  - Inbound: Port 5432 from EC2 security group only

### 3. Storage

#### S3 Buckets
- **Bucket Name**: `done-deal-digital-prod`
- **Purpose**: Store beat files, merchandise images, user uploads
- **Versioning**: Enabled
- **Encryption**: AES-256 (default)
- **Access**: Private with CloudFront distribution

### 4. Networking

#### VPC Configuration
- **CIDR Block**: 10.0.0.0/16
- **Subnets**:
  - Public: 10.0.1.0/24 (us-west-2a), 10.0.2.0/24 (us-west-2b)
  - Private: 10.0.10.0/24 (us-west-2a), 10.0.11.0/24 (us-west-2b)
- **Internet Gateway**: Attached to VPC
- **NAT Gateway**: In public subnet for private subnet outbound access

#### Route 53
- **Hosted Zone**: donedealdigital.com
- **A Record**: done-deal-backend.donedealdigital.com → ALB DNS

### 5. Monitoring & Logging

#### CloudWatch
- **Log Group**: `/aws/done-deal-digital/backend`
- **Metrics**:
  - CPU Utilization
  - Memory Utilization
  - Network In/Out
  - Request Count
  - Error Rates
- **Alarms**:
  - High CPU (>70% for 5 min)
  - High Memory (>85% for 5 min)
  - Backend errors (>5% error rate)
  - Health check failures

#### CloudWatch Logs Agent
- Forward application logs to CloudWatch
- Log retention: 30 days

### 6. Security

#### Secrets Manager
- Store sensitive credentials:
  - Database password
  - JWT secrets
  - Stripe/PayPal keys
  - API keys

#### ACM (AWS Certificate Manager)
- SSL/TLS certificate for HTTPS
- Auto-renewal enabled

#### IAM Roles
- **EC2 Role**: Permissions for:
  - S3 bucket access
  - RDS access
  - CloudWatch Logs write
  - Secrets Manager read
  - Parameter Store read

### 7. Backups & Disaster Recovery

#### RDS Automated Backups
- Retention: 30 days
- Backup window: 03:00-04:00 UTC

#### S3 Versioning
- Keep previous versions of objects
- 90-day retention for old versions

## Deployment Steps

### Step 1: Create VPC and Networking
```bash
# Use AWS CLI or Console to create:
# 1. VPC with CIDR 10.0.0.0/16
# 2. Public subnets in 2 AZs
# 3. Private subnets in 2 AZs
# 4. Internet Gateway and NAT Gateway
# 5. Route tables for public and private subnets
```

### Step 2: Create RDS Database
```bash
# Create PostgreSQL RDS instance
# - Instance class: db.t3.small
# - Multi-AZ enabled
# - Private subnet group
# - Security group allowing port 5432 from EC2 SG
```

### Step 3: Create S3 Buckets
```bash
aws s3 mb s3://done-deal-digital-prod --region us-west-2
aws s3api put-bucket-versioning --bucket done-deal-digital-prod --versioning-configuration Status=Enabled
```

### Step 4: Set Up Application Load Balancer
```bash
# Create ALB in public subnets
# - Enable HTTPS on port 443
# - Attach ACM certificate
# - Create target group for EC2 instances
# - Configure health check to /api/health
```

### Step 5: Create Launch Template & Auto Scaling Group
```bash
# Launch Template
# - AMI: Amazon Linux 2
# - Instance type: t3.medium
# - User data: ec2-setup.sh script
# - Security group: ddd-backend-sg
# - IAM role: ddd-ec2-role

# Auto Scaling Group
# - Min: 2, Max: 4 instances
# - Target subnets: private subnets
# - Attach to ALB target group
# - Scale policies: CPU > 70% (scale up), CPU < 30% (scale down)
```

### Step 6: Configure Secrets Manager
```bash
aws secretsmanager create-secret --name ddd-prod-db-password \
  --secret-string "your-secure-password"

aws secretsmanager create-secret --name ddd-prod-jwt-secret \
  --secret-string "your-jwt-secret"

# ... create secrets for Stripe, PayPal keys
```

### Step 7: Deploy Application
```bash
# Push code to repository
git push origin main

# Trigger CodePipeline or manually update ASG
# This will:
# 1. Launch new EC2 instances with latest code
# 2. Run migrations
# 3. Start application services
```

## Monitoring & Maintenance

### Daily Checks
- CloudWatch dashboard for errors and latency
- Database connection pool usage
- S3 bucket size and costs

### Weekly Reviews
- Application error rates
- Failed payment transactions
- Database performance metrics

### Monthly Tasks
- Review and rotate secrets
- Update security patches
- Analyze cost optimization opportunities

## Scaling

### Vertical Scaling
- Increase RDS instance size if database is bottleneck
- Increase EC2 instance type if compute is bottleneck

### Horizontal Scaling
- Auto Scaling Group handles automatic scaling
- Add more EC2 instances when CPU > 70%
- Remove instances when CPU < 30%

## Disaster Recovery

### RDS Backup & Restore
```bash
# List backups
aws rds describe-db-snapshots --db-instance-identifier ddd-prod

# Restore from backup
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier ddd-prod-restored \
  --db-snapshot-identifier snapshot-id
```

### S3 Versioning Recovery
```bash
# List all versions of an object
aws s3api list-object-versions --bucket done-deal-digital-prod

# Restore an older version
aws s3api copy-object \
  --bucket done-deal-digital-prod \
  --copy-source done-deal-digital-prod/key?versionId=version-id \
  --key key
```

## Cost Estimation (Monthly)

- EC2 (2 instances, t3.medium): ~$60
- RDS (db.t3.small, Multi-AZ): ~$200
- ALB: ~$20
- Data transfer: ~$30
- S3 storage (10GB): ~$0.23
- CloudWatch: ~$10
- **Total**: ~$320/month

## Security Best Practices

1. **Never commit secrets** to repository
2. **Use IAM roles** instead of access keys
3. **Enable MFA** on AWS root account
4. **Use VPC endpoints** for AWS service access
5. **Enable CloudTrail** for audit logging
6. **Rotate secrets** regularly
7. **Use security groups** for network isolation
8. **Enable RDS encryption** at rest
9. **Use HTTPS** everywhere
10. **Regular security updates** and patches

## Troubleshooting

### Health Check Failures
```bash
# SSH into EC2 instance
ssh -i ddd-ec2-key.pem ec2-user@instance-ip

# Check application status
sudo systemctl status done-deal-digital-backend

# View logs
sudo journalctl -u done-deal-digital-backend -f

# Test health endpoint
curl http://localhost:5000/api/health
```

### Database Connection Issues
```bash
# Test connection from EC2
psql -h ddd-prod.abc123.us-west-2.rds.amazonaws.com \
  -U dddigital_prod \
  -d done_deal_digital_prod

# Check RDS security group
aws ec2 describe-security-groups --group-ids sg-xxxxxxx
```

### High CPU Usage
```bash
# Check running processes
top -b -n 1 | head -20

# View application logs
sudo journalctl -u done-deal-digital-backend --tail=100
```

## References
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [RDS PostgreSQL Documentation](https://docs.aws.amazon.com/rds/latest/userguide/)
- [ALB Documentation](https://docs.aws.amazon.com/elasticloadbalancing/)
