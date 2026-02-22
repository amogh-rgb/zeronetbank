/**
 * Wallet Sync Service
 * 
 * Handles:
 * - Wallet-initiated synchronization only
 * - Signature verification
 * - Credit delivery
 * - Freeze state updates
 * - Replay protection with nonces
 */

import { Pool } from 'pg';
import { BankCryptoService } from './bank-crypto.service';
import { ImmutableLedgerService } from './immutable-ledger.service';
import { v4 as uuidv4 } from 'uuid';
import type Redis from 'ioredis';
import { TrustScoreService, BankConfidenceSeal } from './trust-score.service';
import { WebSocketHub } from './websocket-hub';

export interface WalletSyncRequest {
  walletId: string;
  deviceId: string;
  lastLedgerHash: string;
  ledgerEntryCount: number;
  syncNonce: string;
  requestSignature: string;
  timestamp: number;
  ip?: string;
  userAgent?: string;
}

export interface CreditEntry {
  walletPublicKey: string;
  amountCents: number;
  description: string;
}

export interface WalletSyncResponse {
  success: boolean;
  syncId: string;
  walletId?: string;
  newCredits: Array<{
    creditId: string;
    walletId: string;
    amountCents: number;
    currency: string;
    issuedAt: number;
    issuerAdminId?: string;
    previousBankLedgerHash: string;
    bankLedgerHash: string;
    description: string;
    ledgerId: number;
    deliverySignature: string;
    issuerId: string;
    bankSignature: string;
  }>;
  containmentMode: 'NORMAL' | 'CONTAINMENT' | 'FREEZE';
  freezeState: {
    frozen: boolean;
    reason?: string;
  };
  trustSeal: BankConfidenceSeal;
  trustScore?: number;
  trustTimestamp?: number;
  trustScoreSignature?: string;
  serverPublicKey: string; // Bank's public key
  serverPublicKeyHex: string; // Bank public key (hex)
  responseSignature: string; // Response signed by bank
  timestamp: number;
  error?: string;
}

export class WalletSyncService {
  private pool: Pool;
  private crypto: BankCryptoService;
  private ledger: ImmutableLedgerService;
  private logger: any;
  private redis: Redis | null;
  private trustScoreService: TrustScoreService;
  private wsHub: WebSocketHub | null;

  constructor(
    pool: Pool,
    crypto: BankCryptoService,
    ledger: ImmutableLedgerService,
    logger: any,
    trustScoreService: TrustScoreService,
    redis: Redis | null,
    wsHub: WebSocketHub | null
  ) {
    this.pool = pool;
    this.crypto = crypto;
    this.ledger = ledger;
    this.logger = logger;
    this.trustScoreService = trustScoreService;
    this.redis = redis;
    this.wsHub = wsHub;
  }

  private buildCanonicalSyncResponse(payload: {
    syncId: string;
    walletId: string;
    newCreditsCount: number;
    containmentMode: string;
    trustScore: number;
    timestamp: number;
  }): string {
    const syncId = payload.syncId;
    const walletId = payload.walletId.toLowerCase();
    const creditsCount = String(payload.newCreditsCount);
    const containmentMode = payload.containmentMode;
    const trustScore = String(payload.trustScore);
    const timestamp = String(payload.timestamp);
    return `SYNC_V1|${syncId}|${walletId}|${creditsCount}|${containmentMode}|${trustScore}|${timestamp}`;
  }

  /**
   * Process wallet sync request
   * Returns signed response with credits
   */
  async sync(request: WalletSyncRequest): Promise<WalletSyncResponse> {
    const syncId = uuidv4();

    try {
      // Step 1: Verify nonce (replay protection)
      const nonceExists = await this.checkNonceReplay(request.walletId, request.syncNonce);
      if (nonceExists) {
        this.logger.warn(`[REPLAY_ATTACK] Duplicate nonce from wallet ${request.walletId}`);
        return this.createErrorResponse(syncId, 'Replay attack detected');
      }

      // Step 1b: Validate clock skew (5 minutes)
      const clockSkewMs = Math.abs(Date.now() - request.timestamp);
      if (clockSkewMs > 5 * 60 * 1000) {
        return this.createErrorResponse(syncId, 'Clock skew too large');
      }

      // Step 2: Load wallet public key from registry
      const wallet = await this.getWalletById(request.walletId);
      if (!wallet) {
        return this.createErrorResponse(syncId, 'Wallet not registered');
      }

      // Step 3: Verify wallet signature on request
      const requestDataToVerify = {
        walletId: request.walletId,
        deviceId: request.deviceId,
        lastLedgerHash: request.lastLedgerHash,
        ledgerEntryCount: request.ledgerEntryCount,
        syncNonce: request.syncNonce,
        timestamp: request.timestamp,
      };

      const signatureValid = this.crypto.verifyWalletSignature(
        wallet.public_key,
        requestDataToVerify,
        request.requestSignature
      );

      if (!signatureValid) {
        this.logger.warn(`[SYNC] ❌ Invalid wallet signature for ${request.walletId}`);
        this.logger.warn(`[SYNC] Expected signer: ${wallet.public_key}`);
        this.logger.warn(`[SYNC] Payload: ${JSON.stringify(requestDataToVerify)}`);
        return this.createErrorResponse(syncId, 'Invalid wallet signature');
      } else {
        this.logger.info(`[SYNC] ✅ Wallet signature verified for ${request.walletId}`);
      }

      // Step 4: Get freeze state
      const freezeState = await this.getFreezeState(wallet.public_key);

      // Step 5: Get unpaid credits
      const unpaidCredits = await this.getUnpaidCredits(wallet.public_key);

      // Step 6: Record sync in log
      await this.recordSync(request, syncId, wallet.public_key);

      // Step 7: Mark credits as delivered and create ledger entries
      const deliveredCredits = [];
      for (const credit of unpaidCredits) {
        // Create delivery signature
        const deliveryData = {
          creditId: credit.id,
          walletPublicKey: wallet.public_key,
          amountCents: credit.amount_cents,
        };
        const deliverySignature = this.crypto.sign(deliveryData);

        // Add to ledger
        let ledgerEntry;
        try {
          ledgerEntry = await this.ledger.appendEntry({
            entry_type: 'CREDIT',
            credit_id: credit.credit_id,
            wallet_id: request.walletId,
            wallet_public_key: wallet.public_key,
            amount_cents: credit.amount_cents,
            currency: credit.currency || 'USD',
            issuer_admin_id: credit.issuer_admin_id || null,
            description: `Credit delivery: ${credit.description || 'batch distribution'}`,
            signed_by: 'SYSTEM',
            wallet_signature: request.requestSignature,
            bank_signature: '', // Will be set by ledger service
            hash_chain: '',
            prev_hash: '',
            metadata: {
              credit_batch_id: credit.batch_id,
              sync_id: syncId,
            },
          });
        } catch (error) {
          this.logger.error('Credit append failed:', error);
          return this.createErrorResponse(syncId, 'Duplicate or invalid credit detected');
        }

        // Mark credit as delivered
        await this.markCreditDelivered(credit.id, ledgerEntry.id, deliverySignature, wallet.public_key);

        deliveredCredits.push({
          creditId: credit.credit_id,
          walletId: request.walletId,
          amountCents: credit.amount_cents,
          currency: credit.currency || 'USD',
          issuedAt: Date.now(),
          issuerAdminId: credit.issuer_admin_id || undefined,
          previousBankLedgerHash: ledgerEntry.prev_hash,
          bankLedgerHash: ledgerEntry.hash_chain,
          description: credit.description || 'Distributed credit',
          ledgerId: ledgerEntry.id,
          deliverySignature,
          issuerId: 'zeronettbank',
          bankSignature: ledgerEntry.bank_signature,
        });
      }

      // Step 8: Generate Bank Confidence Seal
      const trustSeal = await this.trustScoreService.generateSeal(
        request.walletId,
        wallet.public_key
      );

      // Step 9: Create response
      const containmentMode = freezeState.frozen
        ? 'FREEZE'
        : trustSeal.level === 'RISK'
          ? 'CONTAINMENT'
          : 'NORMAL';

      const responseTimestamp = Date.now();
      const responseData = {
        syncId,
        walletId: request.walletId,
        newCreditsCount: deliveredCredits.length,
        containmentMode,
        trustScore: trustSeal.score,
        timestamp: responseTimestamp,
      };

      const canonicalResponse = this.buildCanonicalSyncResponse(responseData);
      const responseSignature = this.crypto.sign(canonicalResponse);

      this.logger.info(`[SYNC] 🔐 Signing response for ${request.walletId}`);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.info(`[SYNC] CANONICAL_STRING_SIGNED: ${canonicalResponse}`);
        this.logger.info(`[SYNC] SIGNATURE_HEX: ${responseSignature}`);
      }

      const response: WalletSyncResponse = {
        success: true,
        syncId,
        walletId: request.walletId,
        newCredits: deliveredCredits,
        containmentMode,
        freezeState: {
          frozen: freezeState.frozen,
          reason: freezeState.frozen ? freezeState.reason : undefined,
        },
        trustSeal,
        trustScore: trustSeal.score,
        trustTimestamp: trustSeal.generatedAt,
        trustScoreSignature: trustSeal.signature,
        serverPublicKey: this.crypto.getPublicKey(),
        serverPublicKeyHex: this.crypto.getPublicKeyHex(),
        responseSignature,
        timestamp: responseTimestamp,
      };

      this.logger.info(
        `✅ Sync completed for wallet ${request.walletId} | Credits: ${deliveredCredits.length}`
      );

      if (deliveredCredits.length > 0) {
        this.wsHub?.broadcast({
          type: 'CREDIT_AVAILABLE',
          walletId: request.walletId,
          timestamp: Date.now(),
          payload: { count: deliveredCredits.length },
        });
      }

      this.wsHub?.broadcast({
        type: 'BANK_TRUTH_UPDATED',
        walletId: request.walletId,
        timestamp: Date.now(),
        payload: { score: trustSeal.score, level: trustSeal.level },
      });

      return response;
    } catch (error) {
      this.logger.error('Sync error:', error);
      return this.createErrorResponse(syncId, 'Sync failed');
    }
  }

  /**
   * Check for replay attacks using nonce
   */
  private async checkNonceReplay(walletId: string, nonce: string): Promise<boolean> {
    try {
      if (this.redis) {
        const key = `sync:nonce:${walletId}:${nonce}`;
        const result = await this.redis.set(key, '1', 'EX', 3600, 'NX');
        return result === null;
      }

      const result = await this.pool.query(
        'SELECT id FROM sync_sessions WHERE wallet_id = $1 AND sync_nonce = $2 AND created_at > NOW() - INTERVAL \'1 hour\'',
        [walletId, nonce]
      );

      return result.rows.length > 0;
    } catch (error) {
      this.logger.error('Nonce check error:', error);
      return true; // Fail safe
    }
  }

  /**
   * Get current freeze state
   */
  private async getFreezeState(walletPublicKey: string): Promise<{ frozen: boolean; reason?: string }> {
    try {
      const result = await this.pool.query(
        'SELECT frozen_at, freeze_reason FROM wallet_freeze_state WHERE wallet_public_key = $1',
        [walletPublicKey]
      );

      if (result.rows.length === 0 || result.rows[0].frozen_at === null) {
        return { frozen: false };
      }

      return {
        frozen: true,
        reason: result.rows[0].freeze_reason,
      };
    } catch (error) {
      this.logger.error('Get freeze state error:', error);
      return { frozen: false };
    }
  }

  /**
   * Get unpaid credits for wallet
   */
  private async getUnpaidCredits(walletPublicKey: string, limit = 100): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT cd.*, cb.batch_name, cb.created_by
         FROM credit_distributions cd
         JOIN credit_batches cb ON cd.batch_id = cb.id
         WHERE cd.wallet_public_key = $1 AND cd.status = 'pending'
         ORDER BY cd.created_at ASC
         LIMIT $2`,
        [walletPublicKey, limit]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Get unpaid credits error:', error);
      return [];
    }
  }

  /**
   * Mark credit as delivered
   */
  private async markCreditDelivered(
    creditId: string,
    ledgerId: number,
    deliverySignature: string,
    walletPublicKey: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE credit_distributions 
         SET status = 'delivered', ledger_id = $1, delivery_signature = $2, synced_at = NOW()
         WHERE id = $3`,
        [ledgerId, deliverySignature, creditId]
      );
    } catch (error) {
      this.logger.error('Mark credit delivered error:', error);
      throw error;
    }
  }

  /**
   * Record sync in log for audit
   */
  private async recordSync(request: WalletSyncRequest, syncId: string, walletPublicKey: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO sync_sessions
        (wallet_id, device_id, sync_nonce, last_ledger_hash, entry_count, status)
        VALUES ($1, $2, $3, $4, $5, $6)`
        ,
        [
          request.walletId,
          request.deviceId,
          request.syncNonce,
          request.lastLedgerHash,
          request.ledgerEntryCount,
          'active',
        ]
      );

      await this.pool.query(
        `UPDATE wallets SET last_sync_at = NOW() WHERE wallet_id = $1`,
        [request.walletId]
      );

      await this.pool.query(
        `INSERT INTO wallet_sync_log 
        (wallet_public_key, sync_nonce, last_ledger_hash, request_signature, response_signature, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          walletPublicKey,
          request.syncNonce,
          request.lastLedgerHash,
          request.requestSignature,
          '',
          request.ip || '0.0.0.0',
          request.userAgent || 'unknown',
        ]
      );
    } catch (error) {
      this.logger.error('Record sync error:', error);
    }
  }

  /**
   * Create error response
   */
  private createErrorResponse(syncId: string, error: string): WalletSyncResponse {
    return {
      success: false,
      syncId,
      newCredits: [],
      containmentMode: 'CONTAINMENT',
      freezeState: { frozen: false },
      trustSeal: {
        walletId: 'unknown',
        score: 0,
        level: 'RISK',
        reasons: [error],
        generatedAt: Date.now(),
        signature: '',
      },
      serverPublicKey: this.crypto.getPublicKey(),
      serverPublicKeyHex: this.crypto.getPublicKeyHex(),
      responseSignature: '',
      timestamp: Date.now(),
      error,
    };
  }

  private async getWalletById(walletId: string): Promise<{ wallet_id: string; public_key: string } | null> {
    try {
      const result = await this.pool.query(
        'SELECT wallet_id, public_key FROM wallets WHERE wallet_id = $1',
        [walletId]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return result.rows[0];
    } catch (error) {
      this.logger.error('Get wallet error:', error);
      return null;
    }
  }
}
