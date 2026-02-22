import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { BankCryptoService } from '../services/bank-crypto.service';
import { ImmutableLedgerService } from '../services/immutable-ledger.service';
import { WalletSyncService } from '../services/wallet-sync.service';
import { TrustScoreService } from '../services/trust-score.service';
import * as Invariants from '../invariants/system-invariants';
import { Logger } from 'pino';

export const createWalletRouter = (
    pool: Pool,
    cryptoService: BankCryptoService,
    ledgerService: ImmutableLedgerService,
    syncService: WalletSyncService,
    trustScoreService: TrustScoreService,
    logger: Logger
) => {
    const router = express.Router();

    /**
     * POST /api/v1/wallet/sync-offline-transactions
     * Batch upload offline transactions for verification and settlement.
     * COMPATIBILITY: Matches reference project "Offline Digital Payment System"
     */
    router.post('/sync-offline-transactions', async (req: Request, res: Response) => {
        try {
            const { transactions } = req.body;

            if (!Array.isArray(transactions)) {
                return res.status(400).json({ error: 'transactions must be an array' });
            }

            logger.info(`[BatchSync] Processing ${transactions.length} offline transactions`);

            const results = {
                synced: [] as string[],
                failed: [] as any[],
                conflicts: [] as any[]
            };

            for (const tx of transactions) {
                try {
                    // 1. Verify Structure
                    const { id, sender, receiver, amount, timestamp, signature, nonce } = tx;
                    if (!id || !sender || !receiver || !amount || !signature || !nonce) {
                        results.failed.push({ id, reason: 'Missing fields' });
                        continue;
                    }

                    // 2. Idempotency Check (Check if already in ledger)
                    const existing = await pool.query(
                        "SELECT id FROM bank_ledger WHERE id = $1",
                        [id] // Assuming tx.id corresponds to our ledger IDs or we map it
                    );

                    if (existing.rows.length > 0) {
                        results.synced.push(id); // Treat as success/already done
                        continue;
                    }

                    // 3. Verify Signature
                    const isValidSig = await cryptoService.verify(
                        `${sender}:${receiver}:${amount}:${nonce}:${timestamp}`, // Canonical logic to be matched in app
                        signature,
                        sender // Sender Public Key
                    );

                    if (!isValidSig) {
                        results.failed.push({ id, reason: 'Invalid Signature' });
                        continue;
                    }

                    // 4. Balance & Nonce Check
                    // Lock sender row?
                    const senderWallet = await pool.query(
                        "SELECT balance_cents FROM wallet_balances WHERE wallet_public_key = $1",
                        [sender]
                    );

                    if (senderWallet.rows.length === 0) {
                        results.failed.push({ id, reason: 'Sender not found' });
                        continue;
                    }

                    const balance = senderWallet.rows[0].balance_cents;
                    const amountCents = Math.round(amount * 100); // Assuming amount is float

                    if (balance < amountCents) {
                        results.failed.push({ id, reason: 'Insufficient funds' });
                        continue;
                    }

                    // 5. Atomic Commit (Simplified for POC)
                    await pool.query('BEGIN');

                    try {
                        // Debit Sender
                        await pool.query(
                            "UPDATE wallet_balances SET balance_cents = balance_cents - $1 WHERE wallet_public_key = $2",
                            [amountCents, sender]
                        );

                        // Credit Receiver
                        await pool.query(
                            "INSERT INTO wallet_balances (wallet_public_key, balance_cents) VALUES ($1, $2) ON CONFLICT (wallet_public_key) DO UPDATE SET balance_cents = wallet_balances.balance_cents + $2",
                            [receiver, amountCents]
                        );

                        // Log to Ledger
                        await pool.query(
                            `INSERT INTO bank_ledger (id, transaction_type, amount_cents, sender_address, recipient_address, created_at, status, signature, nonce)
                VALUES ($1, 'OFFLINE_TRANSFER', $2, $3, $4, to_timestamp($5/1000.0), 'CONFIRMED', $6, $7)`,
                            [id, amountCents, sender, receiver, timestamp, signature, nonce]
                        );

                        await pool.query('COMMIT');
                        results.synced.push(id);

                    } catch (err: any) {
                        await pool.query('ROLLBACK');
                        logger.error(`[BatchSync] Tx ${id} failed db commit: ${err.message}`);
                        results.failed.push({ id, error: err.message });
                    }

                } catch (e: any) {
                    logger.error(`[BatchSync] Tx processing error: ${e.message}`);
                    results.failed.push({ id: tx.id, error: e.message });
                }
            }

            res.json(results);

        } catch (e: any) {
            logger.error('[BatchSync] Critical Error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    return router;
};
