/**
 * Database Migration Script
 * 
 * Usage: npm run migrate
 * 
 * This script:
 * 1. Connects to PostgreSQL
 * 2. Creates all required tables
 * 3. Creates indexes
 * 4. Creates immutability constraints
 * 5. Verifies schema
 */

import { Pool } from 'pg';
import pino from 'pino';
import dotenv from 'dotenv';
import { schema } from './schema';

dotenv.config();

const logger = pino();

async function migrate() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'zeronettbank',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    logger.info('🔌 Connecting to PostgreSQL...');
    const client = await pool.connect();

    // Create necessary extensions
    logger.info('📦 Creating extensions...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    logger.info('✅ Extensions created');

    // Create schema
    logger.info('📋 Creating database schema...');
    const statements = schema.split(';').filter((s) => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await client.query(statement);
        } catch (error: any) {
          // Ignore "already exists" errors
          if (!error.message.includes('already exists')) {
            throw error;
          }
        }
      }
    }
    logger.info('✅ Schema created successfully');

    // Create immutability triggers
    logger.info('🔒 Creating immutability constraints...');
    await createImmutabilityTriggers(client);

    // Verify schema
    logger.info('🔍 Verifying schema...');
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );

    const tables = tableCheck.rows.map((r) => r.table_name);

    const expectedTables = [
      'users',
      'wallets',
      'user_devices',
      'admin_users',
      'approval_requests',
      'admin_actions',
      'bank_ledger',
      'credit_batches',
      'credit_distributions',
      'wallet_freeze_state',
      'wallet_sync_log',
      'sync_sessions',
      'wallet_trust_scores',
      'risk_profiles',
      'fraud_alerts',
      'audit_log',
      'otp_codes',
      'sessions',
      'wallet_links',
      'wallet_link_approvals',
      'bank_settings',
      'bank_key_versions',
    ];

    const missingTables = expectedTables.filter((t) => !tables.includes(t));

    if (missingTables.length > 0) {
      logger.warn(`⚠️  Missing tables: ${missingTables.join(', ')}`);
    } else {
      logger.info(`✅ All ${tables.length} tables created`);
    }

    client.release();

    console.log(`
╔════════════════════════════════════════════════════╗
║   Database Migration Complete ✅                  ║
╚════════════════════════════════════════════════════╝

Tables Created:
${tables.map((t) => `  • ${t}`).join('\n')}

Next Steps:
  1. npm run seed       (create initial admin user)
  2. npm run dev        (start development server)
    `);

  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function createImmutabilityTriggers(client: any) {
  // Function to prevent updates
  await client.query(`
    CREATE OR REPLACE FUNCTION fn_prevent_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Ledger entries are immutable';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Trigger to prevent updates on bank_ledger
  try {
    await client.query(`
      CREATE TRIGGER bank_ledger_no_update
      BEFORE UPDATE ON bank_ledger
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_modification();
    `);
  } catch (error: any) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }

  // Trigger to prevent deletes on bank_ledger
  try {
    await client.query(`
      CREATE TRIGGER bank_ledger_no_delete
      BEFORE DELETE ON bank_ledger
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_modification();
    `);
  } catch (error: any) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }

  // Trigger to prevent updates on audit_log
  try {
    await client.query(`
      CREATE TRIGGER audit_log_no_update
      BEFORE UPDATE ON audit_log
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_modification();
    `);
  } catch (error: any) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }

  // Trigger to prevent deletes on audit_log
  try {
    await client.query(`
      CREATE TRIGGER audit_log_no_delete
      BEFORE DELETE ON audit_log
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_modification();
    `);
  } catch (error: any) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }

  logger.info('✅ Immutability triggers created');
}

migrate();
