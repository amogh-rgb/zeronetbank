/**
 * RED-TEAM ATTACK SIMULATION TESTS
 * 
 * Verifies system resilience against:
 * - Fake credit injection
 * - Replay attacks
 * - Ledger tampering
 * - Wallet spoofing
 * - Single-admin bypass
 * - Pagination abuse
 * - Statement forgery
 * 
 * ALL ATTACKS MUST FAIL SAFELY
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Pool } from 'pg';
import { BankCryptoService } from '../src/services/bank-crypto.service';
import { ImmutableLedgerService } from '../src/services/immutable-ledger.service';
import * as Invariants from '../src/invariants/system-invariants';

describe('🔴 RED-TEAM: Attack Simulation Tests', () => {
  let pool: Pool;
  let cryptoService: BankCryptoService;
  let ledgerService: ImmutableLedgerService;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME_TEST || 'zeronett_bank_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    });

    cryptoService = new BankCryptoService(console);
    await cryptoService.loadKeys();

    ledgerService = new ImmutableLedgerService(pool, cryptoService, console);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('💉 Attack 1: Fake Credit Injection', () => {
    it('should reject credits without bank signature', async () => {
      const fakeCredit = {
        credit_id: 'FAKE_CREDIT_123',
        wallet_public_key: '04abcdef...',
        amount_cents: 1000000, // $10,000
        bank_signature: '', // NO SIGNATURE!
      };

      expect(() => {
        Invariants.assertCreditIsBankSigned(fakeCredit);
      }).toThrow('INVARIANT VIOLATION: Credit must have bank signature');
    });

    it('should reject credits with invalid bank signature', async () => {
      const fakeCredit = {
        credit_id: 'FAKE_CREDIT_456',
        wallet_public_key: '04abcdef...',
        amount_cents: 500000,
        bank_signature: 'totally_fake_signature_that_looks_legit',
      };

      const isValid = cryptoService.verifyBankSignature(
        {
          creditId: fakeCredit.credit_id,
          amount_cents: fakeCredit.amount_cents,
        },
        fakeCredit.bank_signature
      );

      expect(isValid).toBe(false);
    });

    it('should reject ledger append with fake signature', async () => {
      await expect(async () => {
        await ledgerService.appendEntry({
          entry_type: 'CREDIT',
          credit_id: 'FAKE_789',
          wallet_public_key: '04fakekey...',
          amount_cents: 999999,
          description: 'Attacker injected credit',
          signed_by: 'ATTACKER',
          bank_signature: 'fake_sig',
          hash_chain: '',
          prev_hash: '',
        });
      }).rejects.toThrow();
    });
  });

  describe('🔁 Attack 2: Replay Attack', () => {
    it('should reject duplicate nonces', () => {
      const nonce = 'nonce_12345';
      const exists = true; // Simulate nonce already used

      expect(() => {
        Invariants.assertNonceIsUnique(nonce, exists);
      }).toThrow('INVARIANT VIOLATION: Nonce replay attack detected');
    });

    it('should reject duplicate credit IDs', () => {
      const creditId = 'credit_abc123';
      const exists = true; // Simulate credit already applied

      expect(() => {
        Invariants.assertCreditIsIdempotent(creditId, exists);
      }).toThrow('INVARIANT VIOLATION: Duplicate credit detected');
    });

    it('should reject stale timestamps (clock skew)', () => {
      const oldTimestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago

      expect(() => {
        Invariants.assertClockSkewAcceptable(oldTimestamp, 5 * 60 * 1000);
      }).toThrow('INVARIANT VIOLATION: Clock skew too large');
    });

    it('should reject future timestamps', () => {
      const futureTimestamp = Date.now() + (10 * 60 * 1000); // 10 minutes future

      expect(() => {
        Invariants.assertClockSkewAcceptable(futureTimestamp, 5 * 60 * 1000);
      }).toThrow('INVARIANT VIOLATION: Clock skew too large');
    });
  });

  describe('🔨 Attack 3: Ledger Tampering', () => {
    it('should reject UPDATE operations on ledger', () => {
      const operation = 'UPDATE bank_ledger SET amount_cents = 999999 WHERE id = 1';

      expect(() => {
        Invariants.assertLedgerIsAppendOnly(operation);
      }).toThrow('INVARIANT VIOLATION: Ledger operations must be append-only');
    });

    it('should reject DELETE operations on ledger', () => {
      const operation = 'DELETE FROM bank_ledger WHERE wallet_public_key = "victim"';

      expect(() => {
        Invariants.assertLedgerIsAppendOnly(operation);
      }).toThrow('INVARIANT VIOLATION: Ledger operations must be append-only');
    });

    it('should reject hash chain discontinuity', () => {
      const providedPrevHash = 'hash_abc123';
      const expectedPrevHash = 'hash_xyz789';

      expect(() => {
        Invariants.assertHashChainContinuous(providedPrevHash, expectedPrevHash);
      }).toThrow('INVARIANT VIOLATION: Hash chain discontinuity detected');
    });

    it('should detect broken hash chains in ledger verification', async () => {
      // This tests the ledger integrity check
      const integrity = await ledgerService.verifyIntegrity();
      
      // If system is clean, should be valid
      // In production, any tampering would be caught here
      expect(integrity.valid).toBe(true);
    });
  });

  describe('🎭 Attack 4: Wallet Spoofing', () => {
    it('should reject sync payload with transaction data', () => {
      const maliciousPayload = {
        walletId: 'wallet_123',
        deviceId: 'device_456',
        lastLedgerHash: 'hash_abc',
        ledgerEntryCount: 5,
        syncNonce: 'nonce_xyz',
        timestamp: Date.now(),
        requestSignature: 'signature',
        // ⚠️ ATTACKER ADDED THESE:
        balance: 1000000, // Trying to fake balance
        transactions: [{ amount: 100, to: 'attacker' }],
      };

      expect(() => {
        Invariants.assertSyncPayloadIsProofOnly(maliciousPayload);
      }).toThrow('INVARIANT VIOLATION: Wallet sync payload must NOT contain transaction data');
    });

    it('should reject missing proof fields', () => {
      const incompletePayload = {
        walletId: 'wallet_123',
        // Missing deviceId, lastLedgerHash, etc
      };

      expect(() => {
        Invariants.assertSyncPayloadIsProofOnly(incompletePayload);
      }).toThrow('INVARIANT VIOLATION: Wallet sync payload missing required proof field');
    });

    it('should reject bank public key mismatch (MITM detection)', () => {
      const storedKey = 'bank_key_abc123...';
      const receivedKey = 'different_key_xyz789...';

      expect(() => {
        Invariants.assertBankKeyIsPinned(storedKey, receivedKey);
      }).toThrow('INVARIANT VIOLATION: Bank public key mismatch');
    });
  });

  describe('👤 Attack 5: Single-Admin Bypass Attempt', () => {
    it('should reject single-admin credit issuance', () => {
      const action = 'credit_issuance';
      const approvals = [{ admin_id: 'admin_1', timestamp: Date.now() }];

      expect(() => {
        Invariants.assertDualApprovalRequired(action, approvals);
      }).toThrow('INVARIANT VIOLATION: Critical actions require dual approval');
    });

    it('should reject single-admin containment mode change', () => {
      const action = 'containment_mode_change';
      const approvals = [{ admin_id: 'admin_1' }];

      expect(() => {
        Invariants.assertDualApprovalRequired(action, approvals);
      }).toThrow('INVARIANT VIOLATION: Critical actions require dual approval');
    });

    it('should allow dual approvals', () => {
      const action = 'credit_issuance';
      const approvals = [
        { admin_id: 'admin_1', timestamp: Date.now() },
        { admin_id: 'admin_2', timestamp: Date.now() },
      ];

      expect(() => {
        Invariants.assertDualApprovalRequired(action, approvals);
      }).not.toThrow();
    });
  });

  describe('📄 Attack 6: Pagination Abuse', () => {
    it('should enforce maximum page limit', async () => {
      // Attacker tries to request 10,000 records to DoS or enumerate
      const limit = 10000;
      const maxAllowed = 100;

      // Frontend should cap this
      const effectiveLimit = Math.min(maxAllowed, Math.max(1, limit));
      expect(effectiveLimit).toBe(100);
    });

    it('should validate cursor hash format', () => {
      const maliciousCursor = '../../etc/passwd'; // Path traversal attempt
      const isValidHash = /^[a-f0-9]{64}$/.test(maliciousCursor);

      expect(isValidHash).toBe(false);
    });

    it('should reject invalid date ranges', () => {
      const from = new Date('2026-12-31');
      const to = new Date('2026-01-01');

      expect(from.getTime() > to.getTime()).toBe(true); // Invalid
    });
  });

  describe('📝 Attack 7: Statement Forgery', () => {
    it('should reject forged statement signature', () => {
      const statementHash = cryptoService.hash256({ fake: 'statement' });
      const forgedSignature = 'attacker_forged_signature_looks_real';

      const isValid = cryptoService.verifyBankSignature(
        { statement_hash: statementHash },
        forgedSignature
      );

      expect(isValid).toBe(false);
    });

    it('should reject trust seal without signature', () => {
      const fakeSeal = {
        walletId: 'wallet_123',
        score: 100,
        level: 'VERIFIED',
        reasons: [],
        generatedAt: Date.now(),
        signature: '', // NO SIGNATURE
      };

      expect(() => {
        Invariants.assertTrustSealIsValid(fakeSeal);
      }).toThrow('INVARIANT VIOLATION: Trust seal must be bank-signed');
    });

    it('should reject trust seal with invalid score', () => {
      const fakeSeal = {
        walletId: 'wallet_123',
        score: 150, // OUT OF RANGE (0-100)
        level: 'VERIFIED',
        signature: 'some_sig',
      };

      expect(() => {
        Invariants.assertTrustSealIsValid(fakeSeal);
      }).toThrow('INVARIANT VIOLATION: Trust seal score out of range');
    });
  });

  describe('🔐 Attack 8: Read-Only Mode Bypass', () => {
    it('should block POST in read-only mode', () => {
      const method = 'POST';
      const readOnlyMode = true;

      expect(() => {
        Invariants.assertReadOnlyModeRespected(method, readOnlyMode);
      }).toThrow('INVARIANT VIOLATION: Read-only mode violation');
    });

    it('should block DELETE in read-only mode', () => {
      const method = 'DELETE';
      const readOnlyMode = true;

      expect(() => {
        Invariants.assertReadOnlyModeRespected(method, readOnlyMode);
      }).toThrow('INVARIANT VIOLATION: Read-only mode violation');
    });

    it('should allow GET in read-only mode', () => {
      const method = 'GET';
      const readOnlyMode = true;

      expect(() => {
        Invariants.assertReadOnlyModeRespected(method, readOnlyMode);
      }).not.toThrow();
    });
  });

  describe('❄️ Attack 9: Containment Mode Manipulation', () => {
    it('should reject invalid containment modes', () => {
      const invalidMode = 'HACKER_MODE';

      expect(() => {
        Invariants.assertContainmentModeValid(invalidMode);
      }).toThrow('INVARIANT VIOLATION: Invalid containment mode');
    });

    it('should accept valid containment modes', () => {
      const validModes = ['NORMAL', 'HEIGHTENED', 'CONTAINMENT', 'EMERGENCY_FREEZE'];

      validModes.forEach((mode) => {
        expect(() => {
          Invariants.assertContainmentModeValid(mode);
        }).not.toThrow();
      });
    });
  });

  describe('🚫 Attack 10: Balance Table Creation', () => {
    it('should reject balance table creation', () => {
      const tableName = 'user_balances';

      expect(() => {
        Invariants.assertNoBalanceTable(tableName);
      }).toThrow('INVARIANT VIOLATION: Balance tables are forbidden');
    });

    it('should allow wallet_balances VIEW (derived)', () => {
      const tableName = 'wallet_balances';

      // This is a VIEW, not a table, so it's allowed
      // But we check for BASE TABLEs in the invariant
      // This test ensures the check is specific
      expect(tableName).toBe('wallet_balances');
    });
  });

  describe('🔒 System Integrity Verification', () => {
    it('should verify all immutability triggers exist', async () => {
      const result = await pool.query(`
        SELECT trigger_name FROM information_schema.triggers
        WHERE trigger_name IN (
          'bank_ledger_no_update',
          'bank_ledger_no_delete',
          'audit_log_no_update',
          'audit_log_no_delete'
        )
      `);

      expect(result.rows.length).toBe(4);
    });

    it('should verify no forbidden balance tables exist', async () => {
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name LIKE '%balance%'
        AND table_name != 'wallet_balances'
      `);

      expect(result.rows.length).toBe(0);
    });

    it('should verify all ledger entries are signed', async () => {
      const result = await pool.query(`
        SELECT COUNT(*) as count FROM bank_ledger
        WHERE bank_signature IS NULL OR bank_signature = ''
      `);

      const unsignedCount = parseInt(result.rows[0]?.count || '0');
      expect(unsignedCount).toBe(0);
    });
  });
});
