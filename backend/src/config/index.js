require('dotenv').config({ override: true });

// Fail fast in production if critical secrets are missing
if (process.env.NODE_ENV === 'production') {
  const missing = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}
if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET is not set — authentication tokens will be insecure. Set JWT_SECRET in .env');
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 5000,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  apiUrl: process.env.API_URL || 'http://localhost:5000',
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : null,

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '4h',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE) || 50,
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      endpoint: process.env.S3_ENDPOINT,
    },
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'claude',        // 'claude' | 'openai'
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
    claudeModel: process.env.AI_CLAUDE_MODEL || 'claude-sonnet-4-6',
    openaiModel: process.env.AI_OPENAI_MODEL || 'gpt-4o',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 1024,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'noreply@businessos.ai',
  },

  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL,
    token: process.env.WHATSAPP_TOKEN,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  encryptionKey: process.env.ENCRYPTION_KEY,

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '500'),
  },

  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@businessos.ai',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@1234',
  },
};
