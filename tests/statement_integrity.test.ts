/**
 * Statement Integrity Tests
 * 
 * Verifies:
 * - Same query → same hash
 * - Modified entry → hash mismatch
 * - Signature verification
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { BankCryptoService } from '../src/services/bank-crypto.service';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

describe('Statement Integrity & Verification', () => {
  let pool: Pool;
  let cryptoService: BankCryptoService;
  let logger: any;

  beforeAll(async () => {
    logger = {
      info: console.log,
      error: console.error,
      debug: console.debug,
    };

    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'zeronettbank',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    });

    cryptoService = new BankCryptoService(logger);
    await cryptoService.loadKeys();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should generate same hash for identical queries', async () => {
    const walletPublicKey = 'test-wallet-key-123';

    const query1 = {
      walletId: 'wallet-1',
      entries: [
        { id: 1, amount_cents: 1000, entry_type: 'CREDIT', created_at: '2024-01-01T00:00:00Z' },
        { id: 2, amount_cents: -100, entry_type: 'FEE', created_at: '2024-01-02T00:00:00Z' },
      ],
    };

    const query2 = {
      walletId: 'wallet-1',
      entries: [
        { id: 1, amount_cents: 1000, entry_type: 'CREDIT', created_at: '2024-01-01T00:00:00Z' },
        { id: 2, amount_cents: -100, entry_type: 'FEE', created_at: '2024-01-02T00:00:00Z' },
      ],
    };

    const hash1 = cryptoService.hash256(JSON.stringify(query1));
    const hash2 = cryptoService.hash256(JSON.stringify(query2));

    expect(hash1).toBe(hash2);
  });

  it('should generate different hash when entry is modified', async () => {
    const original = {
      walletId: 'wallet-1',
      entries: [
        { id: 1, amount_cents: 1000, entry_type: 'CREDIT', created_at: '2024-01-01T00:00:00Z' },
      ],
    };

    const modified = {
      walletId: 'wallet-1',
      entries: [
        { id: 1, amount_cents: 2000, entry_type: 'CREDIT', created_at: '2024-01-01T00:00:00Z' },
      ],
    };

    const hash1 = cryptoService.hash256(JSON.stringify(original));
    const hash2 = cryptoService.hash256(JSON.stringify(modified));

    expect(hash1).not.toBe(hash2);
  });

  it('should verify valid signature', async () => {
    const payload = {
      statement_hash: 'abc123def456',
      walletId: 'wallet-1',
    };

    const signature = cryptoService.sign(payload);
    const valid = cryptoService.verifyBankSignature(payload, signature);

    expect(valid).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const payload = {
      statement_hash: 'abc123def456',
      walletId: 'wallet-1',
    };

    const invalidSignature = 'ff'.repeat(64); // Invalid signature

    const valid = cryptoService.verifyBankSignature(payload, invalidSignature);

    expect(valid).toBe(false);
  });

  it('should reject signature with wrong key', async () => {
    const payload = {
      statement_hash: 'abc123def456',
      walletId: 'wallet-1',
    };

    const signature = cryptoService.sign(payload);

    const fakePublicKeyHex = '04' + 'aa'.repeat(64);
    const valid = cryptoService.verifyWalletSignature(fakePublicKeyHex, payload, signature);

    expect(valid).toBe(false);
  });

  it('should detect tampering in statement payload', async () => {
    const original = {
      walletId: 'wallet-1',
      amount_cents: 1000,
      timestamp: '2024-01-01T00:00:00Z',
    };

    const originalHash = cryptoService.hash256(JSON.stringify(original));

    const tampered = {
      walletId: 'wallet-1',
      amount_cents: 10000, // tampered
      timestamp: '2024-01-01T00:00:00Z',
    };

    const tamperedHash = cryptoService.hash256(JSON.stringify(tampered));

    expect(originalHash).not.toBe(tamperedHash);
  });

  it('should maintain hash consistency across multiple verifications', async () => {
    const payload = {
      statement_hash: 'abc123def456',
      walletId: 'wallet-1',
      entries: 100,
    };

    const hashes = Array(5).fill(0).map(() => cryptoService.hash256(JSON.stringify(payload)));

    const allIdentical = hashes.every(h => h === hashes[0]);
    expect(allIdentical).toBe(true);
  });

  it('should produce deterministic signatures for same payload', async () => {
    const payload = {
      statement_hash: 'abc123def456',
      walletId: 'wallet-1',
    };

    const sigs1 = [cryptoService.sign(payload), cryptoService.sign(payload)];

    expect(sigs1.every(s => s === sigs1[0])).toBe(true);
  });
});
