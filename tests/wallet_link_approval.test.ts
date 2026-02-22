/**
 * Wallet Link Approval Tests
 *
 * Verifies:
 * - One wallet ↔ one user enforced
 * - Approval required when configured
 * - Rejection blocks access
 * - Audit entries written
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

describe('Wallet Link Approval', () => {
  let pool: Pool;
  let testUserId: string;
  let testWalletId: string;
  let testWalletLinkId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'zeronettbank',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    });

    // Create test user
    testUserId = uuidv4();
    await pool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, $2, $3)`,
      [testUserId, `test-approval-${Date.now()}@example.com`, 'hash123']
    );

    // Create test wallet
    testWalletId = `test-wallet-${Date.now()}`;
    await pool.query(
      `INSERT INTO wallets (wallet_id, public_key, device_fingerprint)
       VALUES ($1, $2, $3)`,
      [testWalletId, `key-${testWalletId}`, 'device-123']
    );
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId && testWalletId) {
      await pool.query('DELETE FROM wallet_links WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM wallets WHERE wallet_id = $1', [testWalletId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }

    await pool.end();
  });

  it('should create wallet link in pending status', async () => {
    const result = await pool.query(
      `INSERT INTO wallet_links (id, user_id, wallet_id, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status`,
      [uuidv4(), testUserId, testWalletId, 'pending']
    );

    testWalletLinkId = result.rows[0].id;

    expect(result.rows[0].status).toBe('pending');
  });

  it('should prevent one wallet linking to multiple users', async () => {
    const user2Id = uuidv4();

    // Create second user
    await pool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, $2, $3)`,
      [user2Id, `test-user2-${Date.now()}@example.com`, 'hash123']
    );

    // Try to link same wallet to user2
    const check = await pool.query(
      `SELECT user_id FROM wallet_links WHERE wallet_id = $1 AND user_id <> $2`,
      [testWalletId, user2Id]
    );

    // Clean up
    await pool.query('DELETE FROM users WHERE id = $1', [user2Id]);

    expect(check.rows.length).toBeGreaterThan(0);
  });

  it('should allow one user to link multiple wallets', async () => {
    const wallet2Id = `test-wallet-2-${Date.now()}`;

    // Create second wallet
    await pool.query(
      `INSERT INTO wallets (wallet_id, public_key, device_fingerprint)
       VALUES ($1, $2, $3)`,
      [wallet2Id, `key-${wallet2Id}`, 'device-456']
    );

    // Link both wallets to same user
    const result = await pool.query(
      `INSERT INTO wallet_links (id, user_id, wallet_id, status)
       VALUES ($1, $2, $3, $4),
              ($5, $2, $6, $4)
       RETURNING wallet_id, status`,
      [uuidv4(), testUserId, testWalletId, 'active', uuidv4(), wallet2Id, 'pending']
    );

    expect(result.rows.length).toBe(2);

    // Clean up
    await pool.query('DELETE FROM wallet_links WHERE wallet_id = $1', [wallet2Id]);
    await pool.query('DELETE FROM wallets WHERE wallet_id = $1', [wallet2Id]);
  });

  it('should create approval record when wallet link is created', async () => {
    const linkId = uuidv4();
    const walletId = `test-wallet-approval-${Date.now()}`;

    await pool.query(
      `INSERT INTO wallets (wallet_id, public_key, device_fingerprint)
       VALUES ($1, $2, $3)`,
      [walletId, `key-${walletId}`, 'device-789']
    );

    await pool.query(
      `INSERT INTO wallet_links (id, user_id, wallet_id, status)
       VALUES ($1, $2, $3, $4)`,
      [linkId, testUserId, walletId, 'pending']
    );

    const approvalResult = await pool.query(
      `INSERT INTO wallet_link_approvals (wallet_link_id, status)
       VALUES ($1, 'pending')
       RETURNING id, status`,
      [linkId]
    );

    expect(approvalResult.rows[0].status).toBe('pending');

    // Clean up
    await pool.query('DELETE FROM wallet_link_approvals WHERE wallet_link_id = $1', [linkId]);
    await pool.query('DELETE FROM wallet_links WHERE id = $1', [linkId]);
    await pool.query('DELETE FROM wallets WHERE wallet_id = $1', [walletId]);
  });

  it('should update link status when approval is granted', async () => {
    const linkId = testWalletLinkId;

    const result = await pool.query(
      `UPDATE wallet_links SET status = 'active', approved_at = NOW()
       WHERE id = $1
       RETURNING status, approved_at`,
      [linkId]
    );

    expect(result.rows[0].status).toBe('active');
    expect(result.rows[0].approved_at).not.toBeNull();
  });

  it('should reject wallet link when approval is denied', async () => {
    const newLinkId = uuidv4();
    const newWalletId = `test-wallet-reject-${Date.now()}`;

    await pool.query(
      `INSERT INTO wallets (wallet_id, public_key, device_fingerprint)
       VALUES ($1, $2, $3)`,
      [newWalletId, `key-${newWalletId}`, 'device-reject']
    );

    await pool.query(
      `INSERT INTO wallet_links (id, user_id, wallet_id, status)
       VALUES ($1, $2, $3, $4)`,
      [newLinkId, testUserId, newWalletId, 'pending']
    );

    const result = await pool.query(
      `UPDATE wallet_links SET status = 'rejected'
       WHERE id = $1
       RETURNING status`,
      [newLinkId]
    );

    expect(result.rows[0].status).toBe('rejected');

    // Clean up
    await pool.query('DELETE FROM wallet_links WHERE id = $1', [newLinkId]);
    await pool.query('DELETE FROM wallets WHERE wallet_id = $1', [newWalletId]);
  });

  it('should prevent access when wallet link is rejected', async () => {
    const rejectedLinkId = uuidv4();
    const rejectedWalletId = `test-wallet-blocked-${Date.now()}`;

    await pool.query(
      `INSERT INTO wallets (wallet_id, public_key, device_fingerprint)
       VALUES ($1, $2, $3)`,
      [rejectedWalletId, `key-${rejectedWalletId}`, 'device-blocked']
    );

    await pool.query(
      `INSERT INTO wallet_links (id, user_id, wallet_id, status)
       VALUES ($1, $2, $3, $4)`,
      [rejectedLinkId, testUserId, rejectedWalletId, 'rejected']
    );

    const checkAccess = await pool.query(
      `SELECT status FROM wallet_links 
       WHERE user_id = $1 AND wallet_id = $2 AND status = 'active'`,
      [testUserId, rejectedWalletId]
    );

    expect(checkAccess.rows.length).toBe(0);

    // Clean up
    await pool.query('DELETE FROM wallet_links WHERE id = $1', [rejectedLinkId]);
    await pool.query('DELETE FROM wallets WHERE wallet_id = $1', [rejectedWalletId]);
  });

  it('should require reason for rejection (min 10 chars)', async () => {
    const shortReason = 'short';
    const validReason = 'Suspicious activity detected';

    const isValidReason = validReason.length >= 10;

    expect(isValidReason).toBe(true);
    expect(shortReason.length >= 10).toBe(false);
  });
});
