/**
 * Trust Score Service (Bank Confidence Seal)
 *
 * Produces a signed trust score for wallets.
 */

import { Pool } from 'pg';
import { BankCryptoService } from './bank-crypto.service';

export interface BankConfidenceSeal {
  walletId: string;
  score: number;
  level: 'VERIFIED' | 'CAUTION' | 'RISK';
  reasons: string[];
  generatedAt: number;
  signature: string;
}

export class TrustScoreService {
  private pool: Pool;
  private crypto: BankCryptoService;
  private logger: any;

  constructor(pool: Pool, crypto: BankCryptoService, logger: any) {
    this.pool = pool;
    this.crypto = crypto;
    this.logger = logger;
  }

  async generateSeal(walletId: string, walletPublicKey: string): Promise<BankConfidenceSeal> {
    const reasons: string[] = [];

    const ledgerIntegrity = await this.checkLedgerIntegrity(walletPublicKey);
    if (!ledgerIntegrity) {
      reasons.push('Ledger integrity check failed');
    }

    const syncFresh = await this.checkSyncFreshness(walletPublicKey);
    if (!syncFresh) {
      reasons.push('Sync is stale');
    }

    const riskScore = await this.getRiskScore(walletId, walletPublicKey);
    if (riskScore < 50) {
      reasons.push('High risk profile');
    }

    const auditConsistency = await this.checkAuditConsistency();
    if (!auditConsistency) {
      reasons.push('Audit trail inconsistent');
    }

    const baseScore = Math.max(0, Math.min(100, Math.round(riskScore)));
    const scorePenalty = reasons.length * 10;
    const score = Math.max(0, baseScore - scorePenalty);

    let level: BankConfidenceSeal['level'] = 'VERIFIED';
    if (score < 50) {
      level = 'RISK';
    } else if (score < 80) {
      level = 'CAUTION';
    }

    const generatedAt = Date.now();
    const payload = {
      walletId,
      walletPublicKey,
      score,
      level,
      reasons,
      generatedAt,
    };

    const signature = this.crypto.sign(payload);

    return {
      walletId,
      score,
      level,
      reasons,
      generatedAt,
      signature,
    };
  }

  private async checkLedgerIntegrity(walletPublicKey: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT COUNT(*) as count FROM bank_ledger WHERE wallet_public_key = $1',
        [walletPublicKey]
      );
      const count = parseInt(result.rows[0].count || '0');
      return count >= 0;
    } catch (error) {
      this.logger.error('Ledger integrity check error:', error);
      return false;
    }
  }

  private async checkSyncFreshness(walletPublicKey: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT created_at FROM wallet_sync_log WHERE wallet_public_key = $1 ORDER BY created_at DESC LIMIT 1',
        [walletPublicKey]
      );
      if (result.rows.length === 0) {
        return false;
      }
      const lastSync = new Date(result.rows[0].created_at).getTime();
      const sixHours = 6 * 60 * 60 * 1000;
      return Date.now() - lastSync <= sixHours;
    } catch (error) {
      this.logger.error('Sync freshness check error:', error);
      return false;
    }
  }

  private async getRiskScore(walletId: string, walletPublicKey: string): Promise<number> {
    try {
      const riskResult = await this.pool.query(
        'SELECT score FROM risk_profiles WHERE wallet_id = $1',
        [walletId]
      );
      if (riskResult.rows.length > 0) {
        return parseFloat(riskResult.rows[0].score);
      }

      const trustResult = await this.pool.query(
        'SELECT trust_score FROM wallet_trust_scores WHERE wallet_public_key = $1',
        [walletPublicKey]
      );
      if (trustResult.rows.length > 0) {
        return parseFloat(trustResult.rows[0].trust_score);
      }

      return 100;
    } catch (error) {
      this.logger.error('Risk score check error:', error);
      return 0;
    }
  }

  private async checkAuditConsistency(): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT hash_chain, prev_hash FROM audit_log ORDER BY id DESC LIMIT 2'
      );
      if (result.rows.length < 2) {
        return true;
      }
      return result.rows[0].prev_hash === result.rows[1].hash_chain;
    } catch (error) {
      this.logger.error('Audit consistency check error:', error);
      return false;
    }
  }
}
