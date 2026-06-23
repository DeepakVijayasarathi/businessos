/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: [],
  setupFiles: ['./tests/jest.env.js'],
  globalSetup: './tests/jest.global-setup.js',
  clearMocks: true,
  restoreMocks: true,
  forceExit: true,
  testTimeout: 15000,
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/prisma.js',
    '!src/config/logger.js',
    // Secondary/peripheral modules not yet covered
    '!src/modules/marketing/**',
    '!src/modules/messaging/**',
    '!src/modules/notifications/**',
    '!src/modules/search/**',
    '!src/modules/superadmin/**',
    '!src/modules/users/**',
    '!src/modules/activity/**',
    // Services that wrap external providers (tested via integration tests)
    '!src/services/email.service.js',
    '!src/services/whatsapp.service.js',
    '!src/services/notification.service.js',
    // Utility modules with no business logic
    '!src/utils/ics.js',
  ],
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 40,
      functions: 50,
      lines: 50,
    },
  },
  coverageReporters: ['text-summary', 'lcov', 'text'],
};
