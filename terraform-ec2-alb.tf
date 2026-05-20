# Terraform Configuration for Done Deal Digital EC2 & ALB
# Application Load Balancer, Launch Template, and Auto Scaling Group

# Get latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# Reference existing Secrets Manager secret for database credentials
data "aws_secretsmanager_secret" "db_credentials" {
  name = "ddd-prod-db-20260519050527720400000001"
}

# IAM Role for EC2 instances
resource "aws_iam_role" "ec2_role" {
  name_prefix = "ddd-ec2-role-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "ddd-ec2-role"
  }
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "ec2_profile" {
  name_prefix = "ddd-ec2-profile-"
  role        = aws_iam_role.ec2_role.name
}

# IAM Policy for EC2 to access RDS, S3, Secrets Manager, and CloudWatch
resource "aws_iam_role_policy" "ec2_policy" {
  name_prefix = "ddd-ec2-policy-"
  role        = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RDSAccess"
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = "arn:aws:rds:${var.aws_region}:*:dbuser:*/*"
      },
      {
        Sid    = "SecretsManagerAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:ddd-prod-*"
      },
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::done-deal-digital-prod",
          "arn:aws:s3:::done-deal-digital-prod/*"
        ]
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/done-deal-digital/*"
      },
      {
        Sid    = "CloudWatchMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "ec2:DescribeVolumes",
          "ec2:DescribeTags",
          "logs:PutRetentionPolicy"
        ]
        Resource = "*"
      },
      {
        Sid    = "KMSAccess"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = "arn:aws:kms:${var.aws_region}:*:key/*"
      }
    ]
  })
}

# EC2 Launch Template
resource "aws_launch_template" "app" {
  name_prefix = "ddd-app-"

  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.ec2_profile.arn
  }

  vpc_security_group_ids = [aws_security_group.ec2.id]

  # Root volume configuration
  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  # User data script for instance initialization
  user_data = base64encode(<<-EOF
#!/bin/bash

# Done Deal Digital - Robust EC2 Initialization
# This script prioritizes getting the app running with comprehensive logging

LOGFILE="/var/log/done-deal-digital/init.log"
mkdir -p /var/log/done-deal-digital
exec > >(tee -a "$LOGFILE")
exec 2>&1

log_info() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1" | logger -t ddd-init
}

log_error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1" | logger -t ddd-init
}

log_success() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS] $1"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS] $1" | logger -t ddd-init
}

# Helper to upload init logs to S3 as fallback
upload_logs_to_s3() {
  if [ -f "$LOGFILE" ]; then
    INSTANCE_ID=$(ec2-metadata --instance-id 2>/dev/null | cut -d " " -f 2 || echo "unknown")
    AWS_REGION="${var.aws_region}"
    S3_LOG_PATH="s3://done-deal-digital-prod/logs/ec2-init/$INSTANCE_ID-init.log"
    aws s3 cp "$LOGFILE" "$S3_LOG_PATH" --region "$AWS_REGION" 2>/dev/null || true
  fi
}

trap upload_logs_to_s3 EXIT

# Start initialization
log_info "=== EC2 Instance Initialization Started ==="
log_info "Retrieving environment from user data..."

AWS_REGION="${var.aws_region}"
DB_SECRET_ARN="${aws_secretsmanager_secret.db_credentials.arn}"
INSTANCE_ID=$(ec2-metadata --instance-id 2>/dev/null | cut -d " " -f 2)

log_info "Instance ID: $INSTANCE_ID"
log_info "Region: $AWS_REGION"
log_info "DB Secret ARN: $DB_SECRET_ARN"

# Install CloudWatch Logs agent with proper error handling
log_info "Installing CloudWatch Logs agent..."
if yum install -y amazon-cloudwatch-agent >> "$LOGFILE" 2>&1; then
  log_success "CloudWatch agent installed from package manager"
else
  log_info "Package manager install failed, downloading directly from AWS..."
  mkdir -p /opt/aws/amazon-cloudwatch-agent
  cd /tmp
  wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm -O cw-agent.rpm 2>&1
  rpm -U ./cw-agent.rpm >> "$LOGFILE" 2>&1 || {
    log_error "Failed to install CloudWatch agent via direct download"
    echo "CloudWatch agent installation failed - proceeding without it" >> "$LOGFILE"
  }
fi

# Verify CloudWatch agent binary exists
if [ ! -f /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl ]; then
  log_error "CloudWatch agent binary not found at expected path"
  CLOUDWATCH_AVAILABLE=false
else
  log_success "CloudWatch agent binary verified"
  CLOUDWATCH_AVAILABLE=true
fi

# Step 1: Update system
log_info "Updating system packages..."
yum update -y >> "$LOGFILE" 2>&1 || log_error "System update failed"
log_success "System updated"

# Step 2: Install Node.js from binary (compatible with Amazon Linux 2)
log_info "Installing Node.js from binary..."
NODE_VERSION="v16.20.2"
NODE_DISTRO="node-$${NODE_VERSION}-linux-x64"
cd /tmp
curl -fsSL https://nodejs.org/dist/$${NODE_VERSION}/$${NODE_DISTRO}.tar.xz -o node.tar.xz >> "$LOGFILE" 2>&1 || log_error "Failed to download Node.js"
tar -xf node.tar.xz >> "$LOGFILE" 2>&1 || log_error "Failed to extract Node.js"
cp -r $${NODE_DISTRO}/* /usr/local/ >> "$LOGFILE" 2>&1 || log_error "Failed to install Node.js"
rm -rf node.tar.xz $${NODE_DISTRO} >> "$LOGFILE" 2>&1

NODE_PATH="/usr/local/bin/node"
log_info "Node.js path: $$NODE_PATH"
$$NODE_PATH --version >> "$LOGFILE" 2>&1
npm --version >> "$LOGFILE" 2>&1

# Step 3: Install dependencies
log_info "Installing system dependencies..."
yum install -y git jq awscliv2 >> "$LOGFILE" 2>&1 || log_error "Dependency installation failed"
amazon-linux-extras install -y nginx1 postgresql14 >> "$LOGFILE" 2>&1 || log_error "Nginx/postgresql14 installation failed"
# AL2 doesn't have postgresql15 in extras; postgresql14 client is protocol-compatible with PG15 server
log_success "Dependencies installed"

# Step 4: Create app directory
log_info "Creating application directory..."
mkdir -p /opt/done-deal-digital
mkdir -p /var/log/done-deal-digital
chown -R ec2-user:ec2-user /opt/done-deal-digital
chown -R ec2-user:ec2-user /var/log/done-deal-digital
log_success "Application directory ready"

# Step 5: Retrieve database credentials
log_info "Retrieving database credentials from Secrets Manager..."
DB_CREDENTIALS=$(aws secretsmanager get-secret-value \
  --secret-id "$DB_SECRET_ARN" \
  --region "$AWS_REGION" \
  --query SecretString \
  --output text 2>&1) || {
  log_error "Failed to retrieve database credentials: $DB_CREDENTIALS"
  echo "Full error details: $DB_CREDENTIALS" >> "$LOGFILE"
  exit 1
}

DB_HOST=$(echo "$DB_CREDENTIALS" | jq -r '.host' 2>/dev/null)
DB_PORT=$(echo "$DB_CREDENTIALS" | jq -r '.port' 2>/dev/null)
DB_NAME=$(echo "$DB_CREDENTIALS" | jq -r '.dbname' 2>/dev/null)
DB_USER=$(echo "$DB_CREDENTIALS" | jq -r '.username' 2>/dev/null)
DB_PASSWORD=$(echo "$DB_CREDENTIALS" | jq -r '.password' 2>/dev/null)

log_info "Database Host: $DB_HOST"
log_info "Database Port: $DB_PORT"
log_info "Database Name: $DB_NAME"
log_info "Database User: $DB_USER"

# Step 6: Download and deploy application
log_info "Cloning application code from GitHub..."
cd /opt/done-deal-digital
git clone https://github.com/donedealdigi/done-deal-digital-backend.git . >> "$LOGFILE" 2>&1 || {
  log_error "Failed to clone application code from GitHub"
  exit 1
}

chown -R ec2-user:ec2-user /opt/done-deal-digital
log_success "Application code deployed"

# Step 7: Install Node.js dependencies
log_info "Installing Node.js dependencies..."
cd /opt/done-deal-digital
npm ci --production >> "$LOGFILE" 2>&1 || {
  log_error "Failed to install npm dependencies"
  cat "$LOGFILE" | tail -50 >> "$LOGFILE"
  exit 1
}
log_success "Dependencies installed"

# Step 8: Create environment file
log_info "Creating environment configuration..."
cat > /opt/done-deal-digital/.env.production << ENVEOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
NODE_ENV=production
HOST=0.0.0.0
PORT=5000
LOG_LEVEL=info
AWS_REGION=$AWS_REGION
AWS_S3_BUCKET=done-deal-digital-prod
ENABLE_CLOUDWATCH_LOGS=true
INSTANCE_ID=$INSTANCE_ID
ENVEOF

log_info "Fetching application secrets from Secrets Manager..."
APP_SECRET_ARN="arn:aws:secretsmanager:us-west-2:055340194864:secret:ddd-prod-app-env-OWOU9f"
APP_SECRETS_JSON=$(aws secretsmanager get-secret-value --secret-id "$APP_SECRET_ARN" --region "$AWS_REGION" --query SecretString --output text 2>&1) || {
  log_error "Failed to retrieve application secrets: $APP_SECRETS_JSON"
  exit 1
}
echo "$APP_SECRETS_JSON" | jq -r 'to_entries[] | "\(.key)=\(.value)"' >> /opt/done-deal-digital/.env.production
log_success "Application secrets merged into env file"

chown ec2-user:ec2-user /opt/done-deal-digital/.env.production
chmod 600 /opt/done-deal-digital/.env.production
log_success "Environment file created"

# Step 8a: Apply incremental schema additions (service_deposits + paypal columns).
# Targeted, idempotent (IF NOT EXISTS / DROP NOT NULL guards). Does NOT use run.js
# because the old 001/002 migrations have non-PG syntax that would error.
log_info "Applying incremental migrations (003, 004)..."
for MIGRATION in 003_service_deposits.sql 004_paypal_deposit_columns.sql; do
  if [ -f "/opt/done-deal-digital/migrations/$MIGRATION" ]; then
    log_info "  -> $MIGRATION"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "/opt/done-deal-digital/migrations/$MIGRATION" >> "$LOGFILE" 2>&1 || log_error "$MIGRATION failed (continuing boot)"
  fi
done
log_success "Incremental migrations applied (or already present)"

# Step 8b: Configure CloudWatch Logs agent (only if available)
if [ "$CLOUDWATCH_AVAILABLE" = true ]; then
  log_info "Configuring CloudWatch Logs agent..."
  mkdir -p /opt/aws/amazon-cloudwatch-agent/etc
  cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << CWCONFIG
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/done-deal-digital/init.log",
            "log_group_name": "/aws/ec2/done-deal-digital/init",
            "log_stream_name": "$INSTANCE_ID"
          },
          {
            "file_path": "/var/log/nginx/done-deal-digital-access.log",
            "log_group_name": "/aws/ec2/done-deal-digital/nginx-access",
            "log_stream_name": "$INSTANCE_ID"
          },
          {
            "file_path": "/var/log/nginx/done-deal-digital-error.log",
            "log_group_name": "/aws/ec2/done-deal-digital/nginx-error",
            "log_stream_name": "$INSTANCE_ID"
          }
        ]
      }
    }
  }
}
CWCONFIG

  if /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json >> "$LOGFILE" 2>&1; then
    log_success "CloudWatch agent configured and started"
  else
    log_error "CloudWatch agent configuration failed - logs will be uploaded to S3 on exit"
  fi
else
  log_info "CloudWatch agent not available - logs will be uploaded to S3 on exit"
fi

# Step 10: Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/done-deal-digital.service << SYSTEMD
[Unit]
Description=Done Deal Digital Backend Service
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/done-deal-digital
EnvironmentFile=/opt/done-deal-digital/.env.production
ExecStart=$NODE_PATH src/app.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ddd-backend

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
log_success "Systemd service created"


# Step 11: Configure Nginx
log_info "Configuring Nginx as reverse proxy..."
cat > /etc/nginx/conf.d/done-deal-digital.conf << 'NGINX'
upstream app_backend {
    server 127.0.0.1:5000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 10M;

    access_log /var/log/nginx/done-deal-digital-access.log;
    error_log /var/log/nginx/done-deal-digital-error.log warn;

    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }

    location /api/health {
        access_log off;
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
    }
}
NGINX

nginx -t >> "$LOGFILE" 2>&1 || {
  log_error "Nginx config test failed"
  exit 1
}

systemctl enable nginx >> "$LOGFILE" 2>&1
systemctl start nginx >> "$LOGFILE" 2>&1
log_success "Nginx configured and started"

# Step 12: Start application
log_info "Starting application service..."
systemctl enable done-deal-digital >> "$LOGFILE" 2>&1
systemctl start done-deal-digital >> "$LOGFILE" 2>&1
sleep 3

if systemctl is-active --quiet done-deal-digital; then
  log_success "Application service started"
else
  log_error "Application service failed to start"
  systemctl status done-deal-digital >> "$LOGFILE" 2>&1
  journalctl -u done-deal-digital -n 100 >> "$LOGFILE" 2>&1
  exit 1
fi

# Step 13: Verify health check
log_info "Verifying health check endpoint..."
HEALTH_CHECK_OK=false
for i in {1..30}; do
  if curl -sf http://localhost:5000/api/health > /dev/null 2>&1; then
    log_success "Health check endpoint responding!"
    HEALTH_CHECK_OK=true
    break
  fi
  log_info "Health check attempt $i/30..."
  sleep 1
done

if [ "$HEALTH_CHECK_OK" = false ]; then
  log_error "Health check endpoint not responding after 30 attempts"
  log_error "Checking service status..."
  systemctl status done-deal-digital >> "$LOGFILE" 2>&1
  journalctl -u done-deal-digital -n 50 >> "$LOGFILE" 2>&1
  exit 1
fi

log_success "=== Initialization Completed Successfully ==="
log_info "Application available at http://localhost:5000"
log_info "Logs available at: $LOGFILE"
EOF
  )

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name = "ddd-app-instance"
    }
  }

  tag_specifications {
    resource_type = "volume"

    tags = {
      Name = "ddd-app-volume"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name_prefix        = "ddd-"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_1.id, aws_subnet.public_2.id]

  enable_deletion_protection       = true
  enable_http2                     = true
  enable_cross_zone_load_balancing = true

  tags = {
    Name = "ddd-alb"
  }
}

# Target Group
resource "aws_lb_target_group" "app" {
  name_prefix = "ddd-"
  port        = 5000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id

  health_check {
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/api/health"
    matcher             = "200"
  }

  stickiness {
    type            = "lb_cookie"
    enabled         = true
    cookie_duration = 86400
  }

  tags = {
    Name = "ddd-app-tg"
  }
}

# ALB HTTP Listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ALB HTTPS Listener (requires ACM certificate)
# Note: You need to create/import an SSL certificate in ACM first
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = var.acm_certificate_arn # Set this variable with your ACM certificate ARN

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# Auto Scaling Group
resource "aws_autoscaling_group" "app" {
  name_prefix = "ddd-asg-"
  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  min_size            = var.min_instances
  max_size            = var.max_instances
  desired_capacity    = var.min_instances
  vpc_zone_identifier = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  target_group_arns   = [aws_lb_target_group.app.arn]

  health_check_type         = "ELB"
  health_check_grace_period = 300

  tag {
    key                 = "Name"
    value               = "ddd-app-asg"
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [aws_lb.main]
}

# Scale Up Policy (CPU > 70%)
resource "aws_autoscaling_policy" "scale_up" {
  name                   = "ddd-scale-up-policy"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.app.name
}

# Scale Down Policy (CPU < 30%)
resource "aws_autoscaling_policy" "scale_down" {
  name                   = "ddd-scale-down-policy"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.app.name
}

# CloudWatch Alarm for Scale Up
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "ddd-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 70
  alarm_description   = "Trigger scale up when CPU > 70%"
  alarm_actions       = [aws_autoscaling_policy.scale_up.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app.name
  }
}

# CloudWatch Alarm for Scale Down
resource "aws_cloudwatch_metric_alarm" "cpu_low" {
  alarm_name          = "ddd-cpu-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 30
  alarm_description   = "Trigger scale down when CPU < 30%"
  alarm_actions       = [aws_autoscaling_policy.scale_down.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app.name
  }
}

# CloudWatch Alarm for Unhealthy Hosts
resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "ddd-unhealthy-hosts"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "Alert when ALB has unhealthy targets"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }
}

# CloudWatch Alarm for High Error Rate
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "ddd-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Alert when error rate is high"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }
}

# Additional variable for ACM certificate
variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS (required for production)"
  type        = string
  default     = "" # Must be provided before HTTPS listener will work
}

# Outputs
output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ARN of the load balancer"
  value       = aws_lb.main.arn
}

output "alb_zone_id" {
  description = "Zone ID of the load balancer for Route53"
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.app.arn
}

output "asg_name" {
  description = "Name of the Auto Scaling Group"
  value       = aws_autoscaling_group.app.name
}

output "launch_template_id" {
  description = "ID of the launch template"
  value       = aws_launch_template.app.id
}

output "ec2_role_arn" {
  description = "ARN of the EC2 IAM role"
  value       = aws_iam_role.ec2_role.arn
}
