// Set all required env vars before any module is loaded.
// This file runs via jest setupFiles (before test framework, before imports).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-minimum-32!!';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-min!';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.ANTHROPIC_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.AI_PROVIDER = 'claude';
process.env.SMTP_HOST = '';
process.env.UPLOAD_PATH = './uploads-test';
process.env.AI_TIMEOUT_MS = '5000';
