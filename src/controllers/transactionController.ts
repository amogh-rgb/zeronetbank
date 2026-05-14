import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface SyncTransactionRequest {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: string;
  signature: string;
}

export class TransactionController {
  /**
   * POST /transactions/sync
   * Sync transaction from client
   */
  static async syncTransaction(req: Request, res: Response): Promise<void> {
    try {
      const transactionData: SyncTransactionRequest = req.body;

      // Validate required fields
      if (!transactionData.id || !transactionData.from || !transactionData.to || 
          !transactionData.amount || !transactionData.timestamp || !transactionData.signature) {
        res.status(400).json({
          success: false,
          message: 'Missing required transaction fields'
        });
        return;
      }

      // Verify signature
      const signatureValid = await this.verifyTransactionSignature(transactionData);
      if (!signatureValid) {
        res.status(400).json({
          success: false,
          message: 'Invalid transaction signature'
        });
        return;
      }

      // Check balance
      const balanceCheck = await this.checkBalance(transactionData.from, transactionData.amount);
      if (!balanceCheck.sufficient) {
        res.status(400).json({
          success: false,
          message: 'Insufficient balance',
          currentBalance: balanceCheck.balance
        });
        return;
      }

      // Check for replay (nonce/idempotency)
      const replayCheck = await this.checkReplayProtection(transactionData);
      if (replayCheck.isReplay) {
        res.status(400).json({
          success: false,
          message: 'Transaction already processed (replay protection)'
        });
        return;
      }

      // Store transaction (in a real system, this would update the ledger)
      await this.storeTransaction(transactionData);

      // Emit real-time update
      this.emitTransactionUpdate({
        transactionId: transactionData.id,
        status: 'SYNCED',
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: 'Transaction synced successfully',
        transactionId: transactionData.id
      });

    } catch (error) {
      console.error('Transaction sync error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Verify transaction signature
   */
  private static async verifyTransactionSignature(transaction: SyncTransactionRequest): Promise<boolean> {
    try {
      // In a real system, verify using public key cryptography
      // For now, implement basic signature validation
      const signature = transaction.signature;
      const expectedSignature = this.generateExpectedSignature(transaction);
      
      return signature === expectedSignature;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Generate expected signature (simplified for demo)
   */
  private static generateExpectedSignature(transaction: SyncTransactionRequest): string {
    const data = `${transaction.from}${transaction.to}${transaction.amount}${transaction.timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Check user balance
   */
  private static async checkBalance(walletId: string, amount: number): Promise<{
    sufficient: boolean;
    balance: number;
  }> {
    try {
      const query = `
        SELECT balance 
        FROM users 
        WHERE wallet_id = ?
      `;

      const result = await DatabaseService.get(query, [walletId]);
      const currentBalance = result?.balance || 0;

      return {
        sufficient: currentBalance >= amount,
        balance: currentBalance
      };
    } catch (error) {
      console.error('Balance check error:', error);
      return {
        sufficient: false,
        balance: 0
      };
    }
  }

  /**
   * Check replay protection (nonce/idempotency)
   */
  private static async checkReplayProtection(transaction: SyncTransactionRequest): Promise<{
    isReplay: boolean;
    nonce?: string;
  }> {
    try {
      // Check if transaction ID already exists
      const query = `
        SELECT id 
        FROM transactions 
        WHERE id = ?
      `;

      const existingTransaction = await DatabaseService.get(query, [transaction.id]);
      
      return {
        isReplay: existingTransaction != null,
        nonce: transaction.id // Use transaction ID as nonce for simplicity
      };
    } catch (error) {
      console.error('Replay protection check error:', error);
      return {
        isReplay: true // Fail safe
      };
    }
  }

  /**
   * Store transaction in database
   */
  private static async storeTransaction(transaction: SyncTransactionRequest): Promise<void> {
    const query = `
      INSERT INTO transactions (id, from_wallet, to_wallet, amount, type, status, created_at, metadata)
      VALUES (?, ?, ?, ?, 'TRANSFER', 'COMPLETED', ?, ?)
    `;

    await DatabaseService.execute(query, [
      transaction.id,
      transaction.from,
      transaction.to,
      transaction.amount,
      new Date().toISOString(),
      JSON.stringify({
        signature: transaction.signature,
        syncedAt: new Date().toISOString(),
        source: 'offline_sync'
      })
    ]);
  }

  /**
   * Emit transaction update via WebSocket
   */
  private static emitTransactionUpdate(data: {
    transactionId: string;
    status: string;
    timestamp: string;
  }): void {
    // In a real system, this would emit to WebSocket clients
    console.log('Emitting transaction update:', data);
    
    // Store in audit log
    this.logTransactionEvent(data.transactionId, 'TRANSACTION_UPDATE', data.status);
  }

  /**
   * Log transaction event
   */
  private static async logTransactionEvent(
    transactionId: string,
    eventType: string,
    description: string
  ): Promise<void> {
    const query = `
      INSERT INTO audit_logs (id, user_id, event_type, description, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `;

    await DatabaseService.execute(query, [
      uuidv4(),
      null, // No specific user for sync transactions
      eventType,
      description,
      new Date().toISOString()
    ]);
  }

  /**
   * GET /transactions/pending/:walletId
   * Get pending transactions for a wallet
   */
  static async getPendingTransactions(req: Request, res: Response): Promise<void> {
    try {
      const { walletId } = req.params;

      if (!walletId) {
        res.status(400).json({
          success: false,
          message: 'Wallet ID is required'
        });
        return;
      }

      // Get pending transactions from offline storage (in a real system)
      // For now, return empty as we don't have offline storage on backend
      res.json({
        success: true,
        pendingTransactions: [],
        message: 'No pending transactions found'
      });

    } catch (error) {
      console.error('Get pending transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * POST /transactions/validate
   * Validate transaction without storing
   */
  static async validateTransaction(req: Request, res: Response): Promise<void> {
    try {
      const transactionData: SyncTransactionRequest = req.body;

      // Validate required fields
      if (!transactionData.id || !transactionData.from || !transactionData.to || 
          !transactionData.amount || !transactionData.timestamp || !transactionData.signature) {
        res.status(400).json({
          success: false,
          message: 'Missing required transaction fields'
        });
        return;
      }

      // Perform all validations
      const signatureValid = await this.verifyTransactionSignature(transactionData);
      const balanceCheck = await this.checkBalance(transactionData.from, transactionData.amount);
      const replayCheck = await this.checkReplayProtection(transactionData);

      res.json({
        success: true,
        valid: signatureValid && balanceCheck.sufficient && !replayCheck.isReplay,
        checks: {
          signature: signatureValid,
          balance: balanceCheck,
          replay: replayCheck
        },
        message: 'Transaction validation completed'
      });

    } catch (error) {
      console.error('Transaction validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
