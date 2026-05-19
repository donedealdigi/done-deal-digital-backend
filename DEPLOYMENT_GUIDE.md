# Done Deal Digital Backend - Complete Deployment Guide

## Overview

This guide walks through deploying the Done Deal Digital backend to AWS EC2 with RDS PostgreSQL, S3 storage, and CloudFront CDN.

**Architecture**: ALB → EC2 ASG (2-4 instances) → RDS PostgreSQL + S3

**Estimated Time**: 2-3 hours

---

## Phase 1: Pre-Deployment Setup (Local Machine)

### 1.1 Install Required Tools

```bash
# AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Terraform (recommended for IaC)
wget https://releases.hashicorp.com/terraform/1.5.0/terraform_1.5.0_linux_amd64.zip
unzip terraform_1.5.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Verify installations
aws --version
terraform --version
node --version
npm --version
git --version
```

### 1.2 Configure AWS CLI

```bash
aws configure

# When prompted:
# AWS Access Key ID: [your-access-key]
# AWS Secret Access Key: [your-secret-key]
# Default region: us-west-2
# Default output format: json
```

### 1.3 Verify AWS Access

```bash
# Test AWS credentials
aws sts get-caller-identity

# Expected output:
# {
#     "UserId": "AIDAI...",
#     "Account": "123456789012",
#     "Arn": "arn:aws:iam::123456789012:user/your-user"
# }
```

### 1.4 Set Environment Variables

```bash
export AWS_REGION=us-west-2
export ENVIRONMENT=production
export DOMAIN=donedealdigital.com
```

### 1.5 Validate Local Setup

```bash
bash validate-deployment.sh
```

Expected: All checks should pass or show only warnings about AWS resources not existing yet.

---

## Phase 2: AWS Infrastructure Setup

### 2.1 Create VPC and Networking (Using Terraform)

```bash
# Initialize Terraform
terraform init

# Plan the infrastructure
terraform plan -out=tfplan

# Review the plan and apply
terraform apply tfplan

# Save outputs
terraform output > terraform-outputs.txt
```

Or **manually** via AWS Console:

1. **Create VPC** (10.0.0.0/16)
   - Go to VPC → Virtual Private Clouds → Create VPC
   - CIDR: 10.0.0.0/16
   - Name: ddd-vpc

2. **Create Subnets**
   - Public Subnet 1a: 10.0.1.0/24
   - Public Subnet 1b: 10.0.2.0/24
   - Private Subnet 1a: 10.0.10.0/24
   - Private Subnet 1b: 10.0.11.0/24

3. **Create Internet Gateway** and attach to VPC

4. **Create NAT Gateway** in public subnet

5. **Create Route Tables** for public and private subnets

### 2.2 Create Security Groups

**EC2 Security Group** (ddd-backend-sg):
```bash
aws ec2 create-security-group \
  --group-name ddd-backend-sg \
  --description "Security group for DDD backend EC2 instances" \
  --vpc-id vpc-xxxxxxxx

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=ddd-backend-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)

# Inbound rules
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 80 --source-group $ALB_SG_ID

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 443 --source-group $ALB_SG_ID

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 5000 --cidr 10.0.0.0/16
```

**ALB Security Group** (ddd-alb-sg):
```bash
aws ec2 create-security-group \
  --group-name ddd-alb-sg \
  --description "Security group for DDD ALB" \
  --vpc-id vpc-xxxxxxxx

ALB_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=ddd-alb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
```

**RDS Security Group** (ddd-db-sg):
```bash
aws ec2 create-security-group \
  --group-name ddd-db-sg \
  --description "Security group for DDD RDS" \
  --vpc-id vpc-xxxxxxxx

DB_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=ddd-db-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $DB_SG_ID \
  --protocol tcp --port 5432 --source-group $SG_ID
```

### 2.3 Create RDS Database

```bash
# Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name ddd-db-subnet-group \
  --db-subnet-group-description "Subnet group for DDD RDS" \
  --subnet-ids subnet-1a subnet-1b

# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier ddd-prod \
  --db-instance-class db.t3.small \
  --engine postgres \
  --engine-version 14.7 \
  --allocated-storage 100 \
  --storage-type gp2 \
  --master-username dddigital_prod \
  --master-user-password 'your-secure-password' \
  --db-name done_deal_digital_prod \
  --db-subnet-group-name ddd-db-subnet-group \
  --vpc-security-group-ids $DB_SG_ID \
  --multi-az \
  --storage-encrypted \
  --backup-retention-period 30 \
  --preferred-backup-window "03:00-04:00" \
  --enable-cloudwatch-logs-exports postgresql

# Wait for instance to be available (5-10 minutes)
aws rds describe-db-instances \
  --db-instance-identifier ddd-prod \
  --query 'DBInstances[0].DBInstanceStatus'
```

### 2.4 Create S3 Bucket

```bash
# Create bucket
aws s3api create-bucket \
  --bucket done-deal-digital-prod \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket done-deal-digital-prod \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket done-deal-digital-prod \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket done-deal-digital-prod \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Create CloudFront distribution (in AWS Console for CNAME/SSL)
```

### 2.5 Create Secrets Manager

```bash
# Database password
aws secretsmanager create-secret \
  --name ddd-prod-db-password \
  --secret-string 'your-secure-database-password'

# JWT secret
aws secretsmanager create-secret \
  --name ddd-prod-jwt-secret \
  --secret-string 'your-super-secret-jwt-key'

# Stripe key
aws secretsmanager create-secret \
  --name ddd-prod-stripe-key \
  --secret-string 'sk_live_...'

# PayPal credentials
aws secretsmanager create-secret \
  --name ddd-prod-paypal-credentials \
  --secret-string '{
    "client_id": "your-id",
    "client_secret": "your-secret"
  }'
```

### 2.6 Create IAM Role and Policy

```bash
# Create assume role policy
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name ddd-ec2-role \
  --assume-role-policy-document file://trust-policy.json

# Attach policy (use the iam-role-policy.json from repo)
aws iam put-role-policy \
  --role-name ddd-ec2-role \
  --policy-name ddd-ec2-policy \
  --policy-document file://iam-role-policy.json

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name ddd-ec2-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name ddd-ec2-profile \
  --role-name ddd-ec2-role
```

---

## Phase 3: EC2 and Application Setup

### 3.1 Request ACM Certificate

```bash
# Request SSL certificate
aws acm request-certificate \
  --domain-name done-deal-backend.donedealdigital.com \
  --validation-method DNS \
  --region us-west-2

# Wait for certificate to be issued (check email for CNAME validation)
```

### 3.2 Create ALB

```bash
# Create ALB
ALB=$(aws elbv2 create-load-balancer \
  --name ddd-backend-alb \
  --subnets subnet-public-1 subnet-public-2 \
  --security-groups $ALB_SG_ID \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

# Create target group
TG=$(aws elbv2 create-target-group \
  --name ddd-backend-tg \
  --protocol HTTP \
  --port 5000 \
  --vpc-id vpc-xxxxxxxx \
  --health-check-path /api/health \
  --health-check-protocol HTTP \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

# Create HTTPS listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-west-2:xxx:certificate/xxx \
  --default-actions Type=forward,TargetGroupArn=$TG

# Create HTTP to HTTPS redirect
aws elbv2 create-listener \
  --load-balancer-arn $ALB \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'
```

### 3.3 Create Launch Template

```bash
# Create launch template
aws ec2 create-launch-template \
  --launch-template-name ddd-backend-lt \
  --launch-template-data '{
    "ImageId": "ami-0a1b2c3d4e5f6g7h8", # Amazon Linux 2 AMI
    "InstanceType": "t3.medium",
    "IamInstanceProfile": {
      "Name": "ddd-ec2-profile"
    },
    "SecurityGroupIds": ["sg-xxxxxxxx"],
    "UserData": "IyEvYmluL2Jhc2gK...",  # Base64 encoded ec2-setup.sh
    "TagSpecifications": [{
      "ResourceType": "instance",
      "Tags": [{
        "Key": "Name",
        "Value": "ddd-backend-instance"
      }]
    }]
  }'
```

### 3.4 Create Auto Scaling Group

```bash
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name ddd-backend-asg \
  --launch-template LaunchTemplateName=ddd-backend-lt,Version='$Latest' \
  --min-size 2 \
  --max-size 4 \
  --desired-capacity 2 \
  --vpc-zone-identifier "subnet-private-1,subnet-private-2" \
  --target-group-arns $TG \
  --health-check-type ELB \
  --health-check-grace-period 300 \
  --tags Key=Name,Value=ddd-backend,PropagateAtLaunch=true

# Create scaling policies
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name ddd-backend-asg \
  --policy-name ddd-scale-up \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ASGAverageCPUUtilization"
    }
  }'
```

### 3.5 SSH into First Instance and Setup

```bash
# Get instance ID
INSTANCE=$(aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=ddd-backend-asg" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

# Get public IP (via NAT/bastion if in private subnet)
# If instance is in private subnet, use Systems Manager Session Manager:
aws ssm start-session --target $INSTANCE

# Once connected, run setup
bash ec2-setup.sh

# Update environment variables
sudo vim /etc/done-deal-digital/env-vars

# Add to file:
export NODE_ENV=production
export PORT=5000
export DB_HOST=ddd-prod.xxx.us-west-2.rds.amazonaws.com
export DB_PORT=5432
export DB_NAME=done_deal_digital_prod
export DB_USER=dddigital_prod
export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id ddd-prod-db-password --query SecretString --output text)
export JWT_SECRET=$(aws secretsmanager get-secret-value --secret-id ddd-prod-jwt-secret --query SecretString --output text)
# ... add other secrets

# Set permissions
sudo chown root:root /etc/done-deal-digital/env-vars
sudo chmod 600 /etc/done-deal-digital/env-vars
```

### 3.6 Initialize Database

```bash
# SSH into EC2 instance (or connect through bastion)
sudo -u ec2-user psql -h ddd-prod.xxx.us-west-2.rds.amazonaws.com \
  -U dddigital_prod \
  -d done_deal_digital_prod \
  -f database-init.sql

# You'll be prompted for password
```

### 3.7 Deploy Application

```bash
cd /opt/done-deal-digital-backend

# Clone repository
git clone https://github.com/yourusername/done-deal-digital-backend.git current
cd current

# Install dependencies
npm ci --production

# Run migrations
npm run migrate

# Start service
sudo systemctl daemon-reload
sudo systemctl start done-deal-digital-backend
sudo systemctl enable done-deal-digital-backend

# Check status
sudo systemctl status done-deal-digital-backend

# Test health endpoint
curl http://localhost:5000/api/health
```

---

## Phase 4: Monitoring and Finalization

### 4.1 Set Up CloudWatch Monitoring

```bash
# Create log groups
aws logs create-log-group --log-group-name /aws/done-deal-digital/backend/application
aws logs create-log-group --log-group-name /aws/done-deal-digital/backend/errors
aws logs create-log-group --log-group-name /aws/done-deal-digital/backend/access

# Set retention
aws logs put-retention-policy \
  --log-group-name /aws/done-deal-digital/backend/application \
  --retention-in-days 30

# Install CloudWatch agent on EC2
# (Follow AWS documentation for installation)
```

### 4.2 Create CloudWatch Alarms

```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name ddd-backend-high-cpu \
  --alarm-description "Alert when CPU > 70%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 70 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-west-2:xxx:ddd-alerts

# Health check failures
aws cloudwatch put-metric-alarm \
  --alarm-name ddd-backend-unhealthy-hosts \
  --alarm-description "Alert when backend instances are unhealthy" \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-west-2:xxx:ddd-alerts
```

### 4.3 Update Route 53 DNS

```bash
# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names ddd-backend-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

# Update A record (or CNAME to ALB)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789ABC \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "done-deal-backend.donedealdigital.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z1BKCTXD74EZPE",
          "DNSName": "'$ALB_DNS'",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

### 4.4 Final Health Checks

```bash
# Test ALB endpoint
curl https://api.donedealdigital.com/api/health

# Check instance logs
aws logs tail /aws/done-deal-digital/backend/application --follow

# Verify database connectivity
curl https://api.donedealdigital.com/api/status

# Test payment endpoints
curl https://api.donedealdigital.com/api/products/beats
```

---

## Troubleshooting

### Health Check Failing

```bash
# SSH into instance
aws ssm start-session --target $INSTANCE

# Check application
sudo systemctl status done-deal-digital-backend
sudo journalctl -u done-deal-digital-backend -n 50

# Check Nginx
sudo systemctl status nginx
sudo nginx -t
```

### Database Connection Issues

```bash
# Test from EC2
psql -h ddd-prod.xxx.us-west-2.rds.amazonaws.com \
  -U dddigital_prod \
  -d done_deal_digital_prod \
  -c "SELECT 1"

# Check security group
aws ec2 describe-security-groups --group-ids sg-xxxxx
```

### High Memory/CPU

```bash
# SSH into instance
top -b -n 1 | head -20

# Check Node process
ps aux | grep node

# View logs for errors
sudo tail -f /var/log/done-deal-digital/error.log
```

---

## Post-Deployment

1. **Monitor for 24 hours** - Watch CloudWatch dashboards
2. **Run load tests** - Verify auto-scaling works
3. **Test disaster recovery** - Ensure backups work
4. **Document changes** - Update runbooks
5. **Brief operations team** - Handoff monitoring

---

## Rollback Plan

If issues occur:

```bash
# Stop accepting traffic
# Scale ASG to 0
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name ddd-backend-asg \
  --desired-capacity 0

# Restore RDS from backup
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier ddd-prod-restored \
  --db-snapshot-identifier snapshot-id

# Update DNS to previous version
# Scale ASG back up
```

---

## Success Criteria

- [ ] ALB health checks passing
- [ ] No errors in CloudWatch logs
- [ ] CPU < 30%
- [ ] Database responding
- [ ] S3 bucket accessible
- [ ] All API endpoints responding
- [ ] Payment flows working
- [ ] 0 failed requests in first hour

