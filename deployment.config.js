/**
 * Deployment Configuration
 * Manages environment-specific settings for backend deployment
 */

const deploymentConfig = {
  development: {
    api_url: 'http://localhost:5000',
    db_host: 'localhost',
    db_port: 5432,
    db_pool_size: 10,
    stripe_mode: 'test',
    paypal_mode: 'sandbox',
    log_level: 'debug',
    cors_origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    ssl_enabled: false
  },

  staging: {
    api_url: 'https://staging-api.donedealdigital.com',
    db_host: 'ddd-mysql-staging.c9akciq32.us-west-2.rds.amazonaws.com',
    db_port: 5432,
    db_pool_size: 15,
    stripe_mode: 'test',
    paypal_mode: 'sandbox',
    log_level: 'info',
    cors_origin: ['https://staging.donedealdigital.com'],
    ssl_enabled: true,
    monitoring_enabled: true,
    backup_enabled: true
  },

  production: {
    api_url: 'https://api.donedealdigital.com',
    db_host: 'ddd-mysql-prod.c9akciq32.us-west-2.rds.amazonaws.com',
    db_port: 5432,
    db_pool_size: 20,
    stripe_mode: 'live',
    paypal_mode: 'live',
    log_level: 'warn',
    cors_origin: ['https://donedealdigital.com', 'https://www.donedealdigital.com'],
    ssl_enabled: true,
    monitoring_enabled: true,
    backup_enabled: true,
    cloudwatch_logs: true,
    rate_limiting: {
      enabled: true,
      window_ms: 900000, // 15 minutes
      max_requests: 100
    },
    cache: {
      enabled: true,
      ttl: 3600 // 1 hour
    }
  }
};

/**
 * Get configuration for current environment
 */
function getConfig() {
  const env = process.env.NODE_ENV || 'development';
  const config = deploymentConfig[env] || deploymentConfig.development;

  return {
    environment: env,
    ...config,
    port: process.env.PORT || 5000,
    jwt_secret: process.env.JWT_SECRET,
    stripe_secret_key: process.env.STRIPE_SECRET_KEY,
    paypal_client_id: process.env.PAYPAL_CLIENT_ID,
    aws_region: process.env.AWS_REGION || 'us-west-2'
  };
}

/**
 * Validate required environment variables
 */
function validateConfig() {
  const config = getConfig();
  const required = [
    'JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'PAYPAL_CLIENT_ID',
    'DB_HOST',
    'DB_NAME'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log(`✅ Configuration validated for ${config.environment} environment`);
  return config;
}

module.exports = {
  getConfig,
  validateConfig,
  deploymentConfig
};
