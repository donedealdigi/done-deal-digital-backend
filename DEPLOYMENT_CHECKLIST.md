# Done Deal Digital Backend - Deployment Checklist

## Pre-Deployment Phase

### 1. AWS Account & Permissions
- [ ] AWS account created and verified
- [ ] IAM user created with appropriate permissions
- [ ] AWS CLI configured with credentials
- [ ] MFA enabled on root account
- [ ] CloudTrail enabled for audit logging
- [ ] Billing alerts configured

### 2. Domain & DNS
- [ ] Domain registered (donedealdigital.com)
- [ ] Route 53 hosted zone created
- [ ] DNS records pointing to CloudFront/ALB
- [ ] SSL/TLS certificate requested in ACM
- [ ] Certificate validated and approved
- [ ] Certificate auto-renewal enabled

### 3. Infrastructure Setup

#### VPC & Networking
- [ ] VPC created with CIDR 10.0.0.0/16
- [ ] Public subnets created (2 AZs)
- [ ] Private subnets created (2 AZs)
- [ ] Internet Gateway attached
- [ ] NAT Gateway created in public subnet
- [ ] Route tables configured correctly
- [ ] Network ACLs reviewed

#### Security Groups
- [ ] EC2 security group created
  - [ ] Port 80 from ALB
  - [ ] Port 443 from ALB
  - [ ] Port 22 from your IP (SSH)
  - [ ] Port 5000 from VPC CIDR
- [ ] ALB security group created
  - [ ] Port 80 from 0.0.0.0/0
  - [ ] Port 443 from 0.0.0.0/0
- [ ] RDS security group created
  - [ ] Port 5432 from EC2 SG

#### RDS Database
- [ ] RDS instance created (db.t3.small)
- [ ] PostgreSQL 14 engine selected
- [ ] Multi-AZ replication enabled
- [ ] Automated backups configured (30 days)
- [ ] Encryption at rest enabled
- [ ] Parameter group customized
- [ ] Master user credentials stored in Secrets Manager
- [ ] Database subnet group created
- [ ] Database initialized with schema
- [ ] Connection tested from EC2

### 4. Storage Setup
- [ ] S3 bucket created (done-deal-digital-prod)
- [ ] Versioning enabled
- [ ] Server-side encryption enabled
- [ ] Public access blocked
- [ ] Bucket policy configured
- [ ] CloudFront distribution created
- [ ] CORS configuration added

### 5. Application & Secrets
- [ ] Git repository created
- [ ] Code pushed to main branch
- [ ] Secrets created in AWS Secrets Manager:
  - [ ] ddd-prod-db-password
  - [ ] ddd-prod-jwt-secret
  - [ ] ddd-prod-jwt-refresh-secret
  - [ ] ddd-prod-stripe-key
  - [ ] ddd-prod-paypal-credentials
  - [ ] ddd-prod-sendgrid-key
- [ ] IAM role created for EC2 instances
- [ ] IAM role policy configured with S3, RDS, Secrets Manager access
- [ ] EC2 key pair created and securely stored

### 6. Load Balancing & Scaling
- [ ] Application Load Balancer created
- [ ] HTTPS listener configured on port 443
- [ ] Target group created for EC2 instances
- [ ] Health check configured:
  - [ ] Path: /api/health
  - [ ] Port: 5000
  - [ ] Protocol: HTTP
  - [ ] Healthy threshold: 2
  - [ ] Unhealthy threshold: 3
  - [ ] Timeout: 5 seconds
  - [ ] Interval: 30 seconds
- [ ] Launch template created with:
  - [ ] AMI: Amazon Linux 2
  - [ ] Instance type: t3.medium
  - [ ] IAM role attached
  - [ ] Security group configured
  - [ ] User data script (ec2-setup.sh)
- [ ] Auto Scaling Group created:
  - [ ] Min: 2, Max: 4
  - [ ] Target subnets: private subnets
  - [ ] Attach to ALB target group
  - [ ] Scaling policies configured (CPU > 70%, CPU < 30%)

## Deployment Phase

### 7. EC2 Instance Setup
- [ ] First EC2 instance launched
- [ ] SSH access verified
- [ ] System updated (yum update)
- [ ] Node.js installed
- [ ] PostgreSQL client installed
- [ ] Git installed
- [ ] Nginx installed and configured
- [ ] Systemd service created
- [ ] Environment variables configured
- [ ] SSL certificates obtained (Let's Encrypt)
- [ ] Nginx configuration validated

### 8. Application Deployment
- [ ] Repository cloned
- [ ] Dependencies installed (npm ci)
- [ ] Database migrations executed
- [ ] Application started successfully
- [ ] Health check endpoint responds (curl /api/health)
- [ ] Service enabled for auto-start
- [ ] Service runs after reboot
- [ ] Logs configured and rotating

### 9. Monitoring & Logging Setup
- [ ] CloudWatch log groups created
- [ ] CloudWatch agent installed on EC2
- [ ] Application logs streaming to CloudWatch
- [ ] Nginx logs streaming to CloudWatch
- [ ] CloudWatch alarms created:
  - [ ] High CPU (>70% for 5 min)
  - [ ] High Memory (>85% for 5 min)
  - [ ] Health check failures
  - [ ] Backend errors (>5% error rate)
  - [ ] RDS connections
  - [ ] Database CPU
  - [ ] Database storage
- [ ] SNS topic created for alarms
- [ ] Email notifications subscribed
- [ ] CloudWatch dashboard created

### 10. Testing
- [ ] Health check endpoint returns 200 OK
- [ ] Database connection verified
- [ ] S3 bucket upload/download works
- [ ] Authentication endpoints work
- [ ] Payment webhook endpoints work
- [ ] Email notifications work
- [ ] Error handling verified
- [ ] Rate limiting works
- [ ] CORS configuration correct
- [ ] Load balancer health check passes

### 11. Security Verification
- [ ] HTTPS/TLS working correctly
- [ ] Security headers present
  - [ ] Strict-Transport-Security
  - [ ] X-Content-Type-Options
  - [ ] X-Frame-Options
  - [ ] X-XSS-Protection
- [ ] No secrets in environment variables
- [ ] No secrets in git history
- [ ] VPC endpoints configured for AWS services
- [ ] Security group rules minimized
- [ ] Database is not publicly accessible
- [ ] S3 bucket is not publicly readable
- [ ] API rate limiting working
- [ ] CORS not too permissive

### 12. Backup & Disaster Recovery
- [ ] RDS automated backups enabled
- [ ] Manual backup created
- [ ] Backup tested for restore
- [ ] S3 versioning enabled
- [ ] S3 lifecycle policy configured
- [ ] Disaster recovery runbook created

## Post-Deployment Phase

### 13. Production Monitoring (First 24 Hours)
- [ ] Monitor error rates in CloudWatch
- [ ] Check application logs for errors
- [ ] Verify all alarms working
- [ ] Check database performance metrics
- [ ] Monitor memory usage
- [ ] Monitor disk usage
- [ ] Check network performance
- [ ] Verify backups completed

### 14. Optimization
- [ ] Review CloudWatch metrics
- [ ] Identify slow endpoints
- [ ] Optimize database queries if needed
- [ ] Review costs
- [ ] Adjust scaling policies if needed
- [ ] Cache frequently accessed data

### 15. Documentation
- [ ] Architecture diagram updated
- [ ] Deployment procedures documented
- [ ] Runbooks created for:
  - [ ] Scaling up/down
  - [ ] Database recovery
  - [ ] Incident response
  - [ ] Log investigation
  - [ ] Performance tuning
- [ ] Contact list updated
- [ ] On-call schedule established

### 16. Handoff to Operations
- [ ] Operations team trained
- [ ] Monitoring dashboard shared
- [ ] Alerting configured for ops team
- [ ] Escalation procedures defined
- [ ] Rollback procedures documented
- [ ] Change log started

## Rollback Checklist (if needed)

- [ ] Stop accepting new requests
- [ ] Switch traffic back to previous version (or static error page)
- [ ] Stop current Auto Scaling Group
- [ ] Restore from RDS backup if database changed
- [ ] Restore from S3 versioning if needed
- [ ] Clear CDN cache
- [ ] Verify previous version works
- [ ] Post-mortem scheduled

## Sign-Off

- **Deployment Date**: ________________
- **Deployed By**: ________________
- **Reviewed By**: ________________
- **Approved By**: ________________
- **All items checked**: ________________

## Notes

```
[Use this space for deployment notes, issues encountered, and resolutions]
```
