/**
 * System Invariants - Runtime Safety Assertions
 * 
 * These checks enforce architectural rules at runtime.
 * Any violation triggers immediate failure (fail-fast).
 * 
 * CRITICAL: Never bypass these checks. Ever.
 */

export class InvariantViolation extends Error {
  constructor(message: string, context?: any) {
    super(`INVARIANT VIOLATION: ${message}`);
    this.name = 'InvariantViolation';
    if (context) {
      this.message += `\nContext: ${JSON.stringify(context, null, 2)}`;
    }
  }
}

/**
 * Assert that credits are bank-signed
 * Credits without bank signature are ALWAYS invalid
 */
export function assertCreditIsBankSigned(credit: any): void {
  if (!credit.bank_signature || typeof credit.bank_signature !== 'string' || credit.bank_signature.length === 0) {
    throw new InvariantViolation('Credit must have bank signature', {
      credit_id: credit.credit_id,
      wallet: credit.wallet_public_key,
      amount: credit.amount_cents,
    });
  }
}

/**
 * Assert that ledger entries are append-only
 * Never UPDATE or DELETE allowed
 */
export function assertLedgerIsAppendOnly(operation: string): void {
  const forbidden = ['UPDATE', 'DELETE', 'TRUNCATE', 'DROP'];
  const upperOp = operation.toUpperCase();
  
  if (forbidden.some(op => upperOp.includes(op))) {
    throw new InvariantViolation('Ledger operations must be append-only', {
      attempted_operation: operation,
    });
  }
}

/**
 * Assert that wallet sync payload is proof-only
 * Wallet must NEVER upload balances or transactions
 */
export function assertSyncPayloadIsProofOnly(payload: any): void {
  const forbidden = [
    'balance',
    'balances',
    'transactions',
    'transaction',
    'history',
    'spend',
    'spends',
    'sends',
    'receives',
  ];

  const keys = Object.keys(payload).map(k => k.toLowerCase());

  for (const key of keys) {
    if (forbidden.includes(key)) {
      throw new InvariantViolation('Wallet sync payload must NOT contain transaction data', {
        forbidden_field: key,
        payload_keys: Object.keys(payload),
      });
    }
  }

  // Verify required proof fields
  const required = ['walletId', 'deviceId', 'lastLedgerHash', 'ledgerEntryCount', 'syncNonce', 'requestSignature', 'timestamp'];
  for (const field of required) {
    const value = payload[field];
    const isMissing = value === undefined || value === null;
    const isBlankString = typeof value === 'string' && value.trim().length == 0;
    if (isMissing || isBlankString) {
      throw new InvariantViolation('Wallet sync payload missing required proof field', {
        missing_field: field,
      });
    }
  }
}

/**
 * Assert that balance is NEVER stored in mutable form
 * Balance must ONLY be derived from ledger
 */
export function assertNoBalanceTable(tableName: string): void {
  const forbidden = [
    'balances',
    'account_balances',
    'wallet_balance',
    'user_balance',
  ];

  if (forbidden.includes(tableName.toLowerCase())) {
    throw new InvariantViolation('Balance tables are forbidden', {
      attempted_table: tableName,
      reason: 'Balance must be derived from immutable ledger',
    });
  }
}

/**
 * Assert that admin actions require dual approval
 * Single-admin money creation is forbidden
 */
export function assertDualApprovalRequired(action: string, approvals: any[]): void {
  const critical = ['credit_issuance', 'containment_mode_change'];

  if (critical.includes(action)) {
    if (approvals.length < 2) {
      throw new InvariantViolation('Critical actions require dual approval', {
        action,
        approvals_count: approvals.length,
        minimum_required: 2,
      });
    }
  }
}

/**
 * Assert that bank public key is pinned and unchanged
 * Key rotation must be explicit and controlled
 */
export function assertBankKeyIsPinned(storedKey: string, receivedKey: string): void {
  if (storedKey && storedKey !== receivedKey) {
    throw new InvariantViolation('Bank public key mismatch', {
      stored_key_fingerprint: storedKey.substring(0, 16) + '...',
      received_key_fingerprint: receivedKey.substring(0, 16) + '...',
      reason: 'Key pinning failed - possible MITM attack',
    });
  }
}

/**
 * Assert that hash chain is continuous
 * Breaks in hash chain indicate tampering
 */
export function assertHashChainContinuous(prevHash: string, expectedPrevHash: string): void {
  if (prevHash !== expectedPrevHash) {
    throw new InvariantViolation('Hash chain discontinuity detected', {
      provided_prev_hash: prevHash.substring(0, 16) + '...',
      expected_prev_hash: expectedPrevHash.substring(0, 16) + '...',
      reason: 'Ledger tampering or out-of-order entries',
    });
  }
}

/**
 * Assert that nonces are unique (replay protection)
 * Duplicate nonces indicate replay attack
 */
export function assertNonceIsUnique(nonce: string, exists: boolean): void {
  if (exists) {
    throw new InvariantViolation('Nonce replay attack detected', {
      nonce: nonce.substring(0, 16) + '...',
      reason: 'Duplicate sync request - possible replay attack',
    });
  }
}

/**
 * Assert that timestamps are within clock skew tolerance
 * Prevents time-based attacks
 */
export function assertClockSkewAcceptable(timestamp: number, maxSkewMs: number = 5 * 60 * 1000): void {
  const now = Date.now();
  const skew = Math.abs(now - timestamp);

  if (skew > maxSkewMs) {
    throw new InvariantViolation('Clock skew too large', {
      timestamp,
      current_time: now,
      skew_ms: skew,
      max_allowed_ms: maxSkewMs,
      reason: 'Time-based attack or system clock issue',
    });
  }
}

/**
 * Assert that statement mode is read-only when required
 * Write operations must be blocked
 */
export function assertReadOnlyModeRespected(method: string, readOnlyMode: boolean): void {
  if (readOnlyMode) {
    const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (writeMethods.includes(method.toUpperCase())) {
      throw new InvariantViolation('Read-only mode violation', {
        attempted_method: method,
        allowed_methods: ['GET', 'HEAD', 'OPTIONS'],
      });
    }
  }
}

/**
 * Assert that trust seal is bank-signed
 * Unsigned seals are invalid
 */
export function assertTrustSealIsValid(seal: any): void {
  if (!seal.signature || typeof seal.signature !== 'string') {
    throw new InvariantViolation('Trust seal must be bank-signed', {
      wallet_id: seal.walletId,
      score: seal.score,
    });
  }

  if (seal.score < 0 || seal.score > 100) {
    throw new InvariantViolation('Trust seal score out of range', {
      score: seal.score,
      valid_range: [0, 100],
    });
  }
}

/**
 * Assert that credits are idempotent
 * Duplicate credit_id must be rejected
 */
export function assertCreditIsIdempotent(creditId: string, exists: boolean): void {
  if (exists) {
    throw new InvariantViolation('Duplicate credit detected', {
      credit_id: creditId,
      reason: 'Credit idempotency violation',
    });
  }
}

/**
 * Assert that containment mode is valid
 * Only predefined modes allowed
 */
export function assertContainmentModeValid(mode: string): void {
  const validModes = ['NORMAL', 'HEIGHTENED', 'CONTAINMENT', 'EMERGENCY_FREEZE'];
  if (!validModes.includes(mode.toUpperCase())) {
    throw new InvariantViolation('Invalid containment mode', {
      provided_mode: mode,
      valid_modes: validModes,
    });
  }
}

/**
 * FEATURE FREEZE ENFORCEMENT
 * Block new money logic from being added
 */
export function assertFeatureFreeze(feature: string, allowedFeatures: string[]): void {
  if (!allowedFeatures.includes(feature)) {
    throw new InvariantViolation('Feature freeze violation', {
      attempted_feature: feature,
      allowed_features: allowedFeatures,
      reason: 'System is in feature freeze - only bug fixes and observability allowed',
    });
  }
}

/**
 * Run all critical invariants on startup
 * Ensures system is in valid state before accepting requests
 */
export async function validateSystemOnStartup(pool: any, logger: any): Promise<void> {
  logger.info('🔒 Running system invariant checks...');

  try {
    // 1. Verify immutability triggers exist
    const triggers = await pool.query(`
      SELECT trigger_name FROM information_schema.triggers
      WHERE trigger_name IN ('bank_ledger_no_update', 'bank_ledger_no_delete', 'audit_log_no_update', 'audit_log_no_delete')
    `);

    if (triggers.rows.length < 4) {
      throw new InvariantViolation('Missing immutability triggers', {
        found: triggers.rows.map((r: any) => r.trigger_name),
        required: ['bank_ledger_no_update', 'bank_ledger_no_delete', 'audit_log_no_update', 'audit_log_no_delete'],
      });
    }

    // 2. Verify no balance tables exist
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name LIKE '%balance%' AND table_name != 'wallet_balances'
    `);

    if (tables.rows.length > 0) {
      throw new InvariantViolation('Forbidden balance table detected', {
        tables: tables.rows.map((r: any) => r.table_name),
        reason: 'wallet_balances view is allowed, but no balance tables',
      });
    }

    // 3. Verify hash chain integrity
    const brokenChain = await pool.query(`
      SELECT COUNT(*) as count FROM (
        SELECT
          id,
          hash_chain,
          prev_hash,
          LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash
        FROM bank_ledger
      ) sub
      WHERE id > 1 AND prev_hash != actual_prev_hash
    `);

    const brokenCount = parseInt(brokenChain.rows[0]?.count || '0');
    if (brokenCount > 0) {
      throw new InvariantViolation('Hash chain broken', {
        broken_entries: brokenCount,
        reason: 'Ledger tampering detected',
      });
    }

    // 4. Verify all ledger entries are signed
    const unsigned = await pool.query(`
      SELECT COUNT(*) as count FROM bank_ledger WHERE bank_signature IS NULL OR bank_signature = ''
    `);

    const unsignedCount = parseInt(unsigned.rows[0]?.count || '0');
    if (unsignedCount > 0) {
      throw new InvariantViolation('Unsigned ledger entries found', {
        unsigned_count: unsignedCount,
        reason: 'All entries must be bank-signed',
      });
    }

    logger.info('✅ All system invariants verified');

  } catch (error) {
    if (error instanceof InvariantViolation) {
      logger.fatal('INVARIANT VIOLATION DETECTED - SYSTEM UNSAFE', error);
      throw error;
    }
    throw error;
  }
}
