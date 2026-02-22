/**
 * Database Seed Script
 * 
 * Usage: npm run seed
 * 
 * This script:
 * 1. Creates initial SUPER_ADMIN user
 * 2. Creates sample FINANCE_ADMIN
 * 3. Creates sample AUDITOR
 * 4. Initializes test wallets
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const logger = pino();

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function seed() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'zeronettbank',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();

    console.log(`
╔════════════════════════════════════════════════════╗
║   ZeroNetBank - Database Seed                     ║
║   Create Initial Admin Users                      ║
╚════════════════════════════════════════════════════╝
    `);

    // Create SUPER_ADMIN
    console.log('\n📝 Create SUPER_ADMIN user:');
    const superAdminEmail = await prompt('  Email: ');
    let superAdminPassword = await prompt('  Password: ');

    // Validate password
    if (superAdminPassword.length < 8) {
      console.error('❌ Password must be at least 8 characters');
      process.exit(1);
    }

    const superAdminPasswordHash = await bcrypt.hash(superAdminPassword, 12);

    // Create super admin user
    const superAdminUserId = uuidv4();
    const superAdminId = uuidv4();

    await client.query(
      `INSERT INTO users (id, email, password_hash, first_name, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [superAdminUserId, superAdminEmail, superAdminPasswordHash, 'Admin', 'active']
    );

    await client.query(
      `INSERT INTO admin_users (id, user_id, role, is_active)
       VALUES ($1, $2, $3, $4)`,
      [superAdminId, superAdminUserId, 'SUPER_ADMIN', true]
    );

    console.log(`✅ SUPER_ADMIN created: ${superAdminEmail}`);

    // Create FINANCE_ADMIN
    console.log('\n📝 Create FINANCE_ADMIN user:');
    const financeAdminEmail = await prompt('  Email: ');
    let financeAdminPassword = await prompt('  Password: ');

    if (financeAdminPassword.length < 8) {
      console.error('❌ Password must be at least 8 characters');
      process.exit(1);
    }

    const financeAdminPasswordHash = await bcrypt.hash(financeAdminPassword, 12);
    const financeAdminUserId = uuidv4();
    const financeAdminId = uuidv4();

    await client.query(
      `INSERT INTO users (id, email, password_hash, first_name, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [financeAdminUserId, financeAdminEmail, financeAdminPasswordHash, 'Finance', 'active']
    );

    await client.query(
      `INSERT INTO admin_users (id, user_id, role, is_active, granted_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [financeAdminId, financeAdminUserId, 'FINANCE_ADMIN', true, superAdminId]
    );

    console.log(`✅ FINANCE_ADMIN created: ${financeAdminEmail}`);

    // Create AUDITOR
    console.log('\n📝 Create AUDITOR user:');
    const auditorEmail = await prompt('  Email: ');
    let auditorPassword = await prompt('  Password: ');

    if (auditorPassword.length < 8) {
      console.error('❌ Password must be at least 8 characters');
      process.exit(1);
    }

    const auditorPasswordHash = await bcrypt.hash(auditorPassword, 12);
    const auditorUserId = uuidv4();
    const auditorId = uuidv4();

    await client.query(
      `INSERT INTO users (id, email, password_hash, first_name, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [auditorUserId, auditorEmail, auditorPasswordHash, 'Audit', 'active']
    );

    await client.query(
      `INSERT INTO admin_users (id, user_id, role, is_active, granted_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [auditorId, auditorUserId, 'AUDITOR', true, superAdminId]
    );

    console.log(`✅ AUDITOR created: ${auditorEmail}`);

    // Create test wallets (for development only)
    console.log('\n📝 Creating test wallets (development only)...');

    const testWallets = [
      '02a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9',
      '03b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0',
      '02c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
    ];

    for (const walletKey of testWallets) {
      // Create trust score
      await client.query(
        `INSERT INTO wallet_trust_scores (wallet_public_key, trust_score, risk_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (wallet_public_key) DO NOTHING`,
        [walletKey, 100, 'LOW']
      );
    }

    console.log(`✅ ${testWallets.length} test wallets registered`);

    client.release();

    console.log(`
╔════════════════════════════════════════════════════╗
║   Seed Complete ✅                                ║
╚════════════════════════════════════════════════════╝

Users Created:
  • SUPER_ADMIN: ${superAdminEmail}
  • FINANCE_ADMIN: ${financeAdminEmail}
  • AUDITOR: ${auditorEmail}

Next Steps:
  1. npm run dev              (start development server)
  2. Login with SUPER_ADMIN credentials
  3. Create FINANCE_ADMIN approvers
  4. Issue test credits

Security Notes:
  ✓ Passwords are bcrypt hashed
  ✓ OTP required for new devices
  ✓ All actions audited
  ✓ Dual approval required for credits
    `);

  } catch (error) {
    console.error('❌ Seed failed:', error);
    logger.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
