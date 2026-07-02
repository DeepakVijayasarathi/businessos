/**
 * auto-migrate.js — runs on every container startup before the server.
 * Uses @prisma/client $executeRaw (no Prisma CLI / WASM needed).
 * All statements are idempotent — safe to run repeatedly.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  console.log('[migrate] Starting auto-migration…');

  const steps = [
    // ── ai_usage_logs ──────────────────────────────────────────────────────
    {
      name: 'create ai_usage_logs table',
      sql: `
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
          id            TEXT         NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
          "companyId"   TEXT         NOT NULL,
          provider      TEXT         NOT NULL,
          model         TEXT         NOT NULL,
          module        TEXT         NOT NULL,
          "inputTokens" INTEGER      NOT NULL DEFAULT 0,
          "outputTokens" INTEGER     NOT NULL DEFAULT 0,
          "costUsd"     DOUBLE PRECISION NOT NULL DEFAULT 0,
          "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
    },
    {
      name: 'ai_usage_logs: companyId index',
      sql: `CREATE INDEX IF NOT EXISTS ai_usage_logs_company_idx ON ai_usage_logs ("companyId")`,
    },
    {
      name: 'ai_usage_logs: companyId + createdAt index',
      sql: `CREATE INDEX IF NOT EXISTS ai_usage_logs_company_date_idx ON ai_usage_logs ("companyId", "createdAt")`,
    },
    {
      name: 'ai_usage_logs: foreign key to companies',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_logs_company_fk'
          ) THEN
            ALTER TABLE ai_usage_logs
              ADD CONSTRAINT ai_usage_logs_company_fk
              FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
          END IF;
        END $$`,
    },

    // ── employees.faceDescriptor ───────────────────────────────────────────
    {
      name: 'employees: add faceDescriptor column',
      sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS "faceDescriptor" JSONB`,
    },

    // ── social_accounts ────────────────────────────────────────────────────────
    {
      name: 'create social_accounts table',
      sql: `
        CREATE TABLE IF NOT EXISTS social_accounts (
          id             TEXT         NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
          "companyId"    TEXT         NOT NULL,
          platform       TEXT         NOT NULL,
          "accountName"  TEXT         NOT NULL,
          "accountId"    TEXT,
          "accessToken"  TEXT,
          "accessSecret" TEXT,
          "pageId"       TEXT,
          "isActive"     BOOLEAN      NOT NULL DEFAULT true,
          "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
    },
    {
      name: 'social_accounts: companyId index',
      sql: `CREATE INDEX IF NOT EXISTS social_accounts_company_idx ON social_accounts ("companyId")`,
    },
    {
      name: 'social_accounts: unique companyId+platform',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'social_accounts_company_platform_key'
          ) THEN
            ALTER TABLE social_accounts
              ADD CONSTRAINT social_accounts_company_platform_key UNIQUE ("companyId", platform);
          END IF;
        END $$`,
    },
  ];

  let ok = 0;
  let skip = 0;

  for (const step of steps) {
    try {
      await prisma.$executeRawUnsafe(step.sql);
      console.log(`[migrate] ✓ ${step.name}`);
      ok++;
    } catch (err) {
      // "already exists" errors are fine — anything else is logged but non-fatal
      if (err.message?.includes('already exists') || err.code === '42701' || err.code === '42P07') {
        console.log(`[migrate] – ${step.name} (already applied)`);
        skip++;
      } else {
        console.warn(`[migrate] ⚠ ${step.name}: ${err.message}`);
      }
    }
  }

  console.log(`[migrate] Done — ${ok} applied, ${skip} already up-to-date.`);
}

run()
  .catch(err => {
    console.error('[migrate] Fatal:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
