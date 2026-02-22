/**
 * Immutable Bank Ledger Service
 * 
 * Enforces:
 * - Append-only transactions
 * - Hash-chain integrity
 * - No UPDATE or DELETE
 * - Complete audit trail
 */

import { Pool } from 'pg';
import { BankCryptoService } from './bank-crypto.service';
import * as Invariants from '../invariants/system-invariants';

export interface LedgerEntry {
  id?: number;
  entry_type: 'CREDIT' | 'FREEZE' | 'UNFREEZE' | 'FEE' | 'ADJUSTMENT';
  credit_id?: string;
  wallet_id?: string;
  wallet_public_key: string;
  amount_cents: number;
  currency?: string;
  issuer_admin_id?: string;
  description: string;
  signed_by: string; // Admin user ID or 'SYSTEM'
  wallet_signature?: string;
  bank_signature: string;
  hash_chain: string;
  prev_hash: string;
  metadata?: Record<string, any>;
}

export interface LedgerBalance {
  wallet_public_key: string;
  balance_cents: number;
  transaction_count: number;
  last_transaction: Date;
}

export class ImmutableLedgerService {
  private pool: Pool;
  private crypto: BankCryptoService;
  private logger: any;
  private lastHash = 'GENESIS'; // Initial hash

  constructor(pool: Pool, crypto: BankCryptoService, logger: any) {
    this.pool = pool;
    this.crypto = crypto;
    this.logger = logger;
    this.initializeGenesis();
  }

  /**
   * Initialize genesis block on first run
   */
  private async initializeGenesis(): Promise<void> {
    try {
      const result = await this.pool.query(
        'SELECT COUNT(*) as count FROM bank_ledger'
      );

      if (result.rows[0].count === 0) {
        // Create genesis entry
        const genesisData = {
          entry_type: 'SYSTEM_INIT',
          amount_cents: 0,
          description: 'Genesis block - ledger initialized',
          timestamp: new Date().toISOString(),
        };

        const signature = this.crypto.sign(genesisData);
        const hash = this.crypto.hash256(genesisData);

        await this.pool.query(
          `INSERT INTO bank_ledger 
          (entry_type, amount_cents, description, signed_by, bank_signature, hash_chain, prev_hash, wallet_public_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          ['SYSTEM_INIT', 0, 'Genesis block', 'SYSTEM', signature, hash, 'GENESIS', 'GENESIS']
        );

        this.lastHash = hash;
        this.logger.info('✅ Genesis block created');
      } else {
        // Load last hash for chain continuation
        const lastEntry = await this.pool.query(
          'SELECT hash_chain FROM bank_ledger ORDER BY id DESC LIMIT 1'
        );
        if (lastEntry.rows.length > 0) {
          this.lastHash = lastEntry.rows[0].hash_chain;
        }
      }
    } catch (error) {
      this.logger.error('Genesis initialization error:', error);
    }
  }

  /**
   * Append a new entry to the ledger (only append allowed)
   */
  async appendEntry(entry: LedgerEntry): Promise<LedgerEntry> {
    // ✅ INVARIANT: Ledger operations must be append-only
    Invariants.assertLedgerIsAppendOnly('INSERT');

    // ✅ INVARIANT: Credits must be bank-signed (verified before reaching here in calling code)
    if (entry.entry_type === 'CREDIT' && entry.credit_id) {
      Invariants.assertCreditIsBankSigned({
        credit_id: entry.credit_id,
        bank_signature: entry.bank_signature,
        wallet_public_key: entry.wallet_public_key,
        amount_cents: entry.amount_cents,
      });
    }

    // Validate entry
    if (!entry.wallet_public_key) {
      throw new Error('wallet_public_key is required');
    }
    if (!entry.entry_type) {
      throw new Error('entry_type is required');
    }

    try {
      // Create hash chain
      const { hash, data } = this.crypto.createHashChain(
        {
          entry_type: entry.entry_type,
          credit_id: entry.credit_id || null,
          wallet_id: entry.wallet_id || null,
          wallet_public_key: entry.wallet_public_key,
          amount_cents: entry.amount_cents,
          currency: entry.currency || 'USD',
          issuer_admin_id: entry.issuer_admin_id || null,
          description: entry.description,
          signed_by: entry.signed_by,
        },
        this.lastHash
      );

      // Sign the entry with bank's private key
      const signature = this.crypto.sign(data);

      const result = await this.pool.query(
        `INSERT INTO bank_ledger 
        (entry_type, credit_id, wallet_id, wallet_public_key, amount_cents, currency, issuer_admin_id, description, signed_by, 
         wallet_signature, bank_signature, hash_chain, prev_hash, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          entry.entry_type,
          entry.credit_id || null,
          entry.wallet_id || null,
          entry.wallet_public_key,
          entry.amount_cents,
          entry.currency || 'USD',
          entry.issuer_admin_id || null,
          entry.description,
          entry.signed_by,
          entry.wallet_signature || null,
          signature,
          hash,
          this.lastHash,
          JSON.stringify(entry.metadata || {}),
        ]
      );

      const newEntry = result.rows[0];
      this.lastHash = hash; // Update for next entry
      this.logger.info(`📝 Ledger entry created: ${entry.entry_type} for ${entry.wallet_public_key.substring(0, 16)}...`);

      return newEntry;
    } catch (error) {
      this.logger.error('Append entry error:', error);
      throw error;
    }
  }

  /**
   * Verify ledger integrity
   * Checks hash chain from start to finish
   */
  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const result = await this.pool.query(
        'SELECT * FROM bank_ledger ORDER BY id ASC'
      );

      let prevHash = 'GENESIS';

      for (const entry of result.rows) {
        // Verify hash chain
        if (entry.prev_hash !== prevHash) {
          errors.push(
            `Entry ${entry.id}: Hash chain broken. Expected prev_hash=${prevHash}, got ${entry.prev_hash}`
          );
        }

        // Verify bank signature
        const dataToVerify = {
          entry_type: entry.entry_type,
          wallet_public_key: entry.wallet_public_key,
          amount_cents: entry.amount_cents,
          description: entry.description,
          signed_by: entry.signed_by,
          timestamp: entry.created_at,
        };

        const isValid = this.crypto.verifyBankSignature(dataToVerify, entry.bank_signature);
        if (!isValid) {
          errors.push(`Entry ${entry.id}: Invalid bank signature`);
        }

        prevHash = entry.hash_chain;
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Integrity verification error:', error);
      throw error;
    }
  }

  /**
   * Get wallet balance from ledger
   */
  async getWalletBalance(walletPublicKey: string): Promise<LedgerBalance | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM wallet_balances WHERE wallet_public_key = $1',
        [walletPublicKey]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      this.logger.error('Get balance error:', error);
      throw error;
    }
  }

  /**
   * Get ledger entries for a wallet (read-only)
   */
  async getWalletLedger(
    walletPublicKey: string,
    limit = 100,
    offset = 0
  ): Promise<LedgerEntry[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM bank_ledger 
         WHERE wallet_public_key = $1 
         ORDER BY id DESC 
         LIMIT $2 OFFSET $3`,
        [walletPublicKey, limit, offset]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Get ledger error:', error);
      throw error;
    }
  }

  /**
   * Get ledger entries for statements (cursor + date filters)
   */
  async getWalletLedgerPage(
    walletPublicKey: string,
    options: {
      limit: number;
      cursorHash?: string;
      from?: Date;
      to?: Date;
    }
  ): Promise<any[]> {
    try {
      let cursorId: number | null = null;
      if (options.cursorHash) {
        const cursorResult = await this.pool.query(
          `SELECT id FROM bank_ledger
           WHERE wallet_public_key = $1 AND hash_chain = $2`,
          [walletPublicKey, options.cursorHash]
        );
        if (cursorResult.rows.length === 0) {
          throw new Error('Invalid cursor');
        }
        cursorId = cursorResult.rows[0].id;
      }

      const conditions: string[] = ['bl.wallet_public_key = $1'];
      const params: any[] = [walletPublicKey];

      if (options.from) {
        params.push(options.from);
        conditions.push(`bl.created_at >= $${params.length}`);
      }

      if (options.to) {
        params.push(options.to);
        conditions.push(`bl.created_at <= $${params.length}`);
      }

      if (cursorId !== null) {
        params.push(cursorId);
        conditions.push(`bl.id < $${params.length}`);
      }

      params.push(options.limit);

      const result = await this.pool.query(
        `SELECT bl.*, cd.created_at as credit_dispatched_at, cd.synced_at as credit_synced_at
         FROM bank_ledger bl
         LEFT JOIN credit_distributions cd
           ON cd.credit_id = bl.credit_id AND cd.wallet_public_key = bl.wallet_public_key
         WHERE ${conditions.join(' AND ')}
         ORDER BY bl.id DESC
         LIMIT $${params.length}`,
        params
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Get ledger page error:', error);
      throw error;
    }
  }

  getLastHash(): string {
    return this.lastHash;
  }

  /**
   * Get all ledger entries (admin only)
   */
  async getAllLedger(limit = 1000, offset = 0): Promise<LedgerEntry[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM bank_ledger 
         ORDER BY id DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Get all ledger error:', error);
      throw error;
    }
  }

  /**
   * Prevent UPDATE/DELETE on ledger
   * This is enforced at DB level with triggers, but double-check in code
   */
  async preventModification(id: number): Promise<never> {
    throw new Error(`Ledger entry ${id} is immutable and cannot be modified`);
  }
}
