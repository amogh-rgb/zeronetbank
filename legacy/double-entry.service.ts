/**
 * Double-Entry Accounting Service
 * 
 * Implements proper double-entry bookkeeping for the bank ledger.
 * Every transaction creates two entries: debit and credit.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AccountEntry {
    accountId: string;
    type: 'DEBIT' | 'CREDIT';
    amount: number;
    currency: string;
    description: string;
    transactionId: string;
    timestamp: Date;
}

export interface DoubleEntryTransaction {
    id: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
    currency: string;
    description: string;
    metadata?: Record<string, any>;
}

export class DoubleEntryService {
    private static readonly BANK_RESERVE_ACCOUNT = 'BANK_RESERVE';
    private static readonly USER_ACCOUNT_PREFIX = 'USER_';

    /**
     * Record a double-entry transaction
     * Debit one account, credit another
     */
    async recordTransaction(transaction: DoubleEntryTransaction): Promise<void> {
        const { id, debitAccountId, creditAccountId, amount, currency, description, metadata } = transaction;

        console.log(`[DoubleEntry] Recording transaction ${id}: ${debitAccountId} -> ${creditAccountId}, ${amount} ${currency}`);

        try {
            // Use Prisma transaction to ensure atomicity
            await prisma.$transaction(async (tx) => {
                // Create debit entry
                await tx.accountEntry.create({
                    data: {
                        accountId: debitAccountId,
                        type: 'DEBIT',
                        amount,
                        currency,
                        description,
                        transactionId: id,
                        timestamp: new Date(),
                        metadata: metadata || {},
                    },
                });

                // Create credit entry
                await tx.accountEntry.create({
                    data: {
                        accountId: creditAccountId,
                        type: 'CREDIT',
                        amount,
                        currency,
                        description,
                        transactionId: id,
                        timestamp: new Date(),
                        metadata: metadata || {},
                    },
                });

                console.log(`[DoubleEntry] ✅ Transaction ${id} recorded successfully`);
            });
        } catch (error) {
            console.error(`[DoubleEntry] ❌ Failed to record transaction ${id}:`, error);
            throw new Error(`Double-entry transaction failed: ${error}`);
        }
    }

    /**
     * Record a user-to-user transfer
     */
    async recordUserTransfer(
        senderId: string,
        receiverId: string,
        amount: number,
        currency: string = 'INR',
        transactionId?: string
    ): Promise<void> {
        const txId = transactionId || `TX_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await this.recordTransaction({
            id: txId,
            debitAccountId: `${DoubleEntryService.USER_ACCOUNT_PREFIX}${senderId}`,
            creditAccountId: `${DoubleEntryService.USER_ACCOUNT_PREFIX}${receiverId}`,
            amount,
            currency,
            description: `Transfer from ${senderId} to ${receiverId}`,
            metadata: {
                type: 'USER_TRANSFER',
                senderId,
                receiverId,
            },
        });
    }

    /**
     * Record a deposit (bank reserve -> user account)
     */
    async recordDeposit(
        userId: string,
        amount: number,
        currency: string = 'INR',
        description?: string
    ): Promise<void> {
        const txId = `DEPOSIT_${Date.now()}_${userId}`;

        await this.recordTransaction({
            id: txId,
            debitAccountId: DoubleEntryService.BANK_RESERVE_ACCOUNT,
            creditAccountId: `${DoubleEntryService.USER_ACCOUNT_PREFIX}${userId}`,
            amount,
            currency,
            description: description || `Deposit to ${userId}`,
            metadata: {
                type: 'DEPOSIT',
                userId,
            },
        });
    }

    /**
     * Record a withdrawal (user account -> bank reserve)
     */
    async recordWithdrawal(
        userId: string,
        amount: number,
        currency: string = 'INR',
        description?: string
    ): Promise<void> {
        const txId = `WITHDRAWAL_${Date.now()}_${userId}`;

        await this.recordTransaction({
            id: txId,
            debitAccountId: `${DoubleEntryService.USER_ACCOUNT_PREFIX}${userId}`,
            creditAccountId: DoubleEntryService.BANK_RESERVE_ACCOUNT,
            amount,
            currency,
            description: description || `Withdrawal from ${userId}`,
            metadata: {
                type: 'WITHDRAWAL',
                userId,
            },
        });
    }

    /**
     * Get account balance
     * Balance = Credits - Debits
     */
    async getAccountBalance(accountId: string, currency: string = 'INR'): Promise<number> {
        const entries = await prisma.accountEntry.findMany({
            where: {
                accountId,
                currency,
            },
        });

        let balance = 0;
        for (const entry of entries) {
            if (entry.type === 'CREDIT') {
                balance += entry.amount;
            } else {
                balance -= entry.amount;
            }
        }

        return balance;
    }

    /**
     * Get bank reserve balance
     */
    async getBankReserveBalance(currency: string = 'INR'): Promise<number> {
        return this.getAccountBalance(DoubleEntryService.BANK_RESERVE_ACCOUNT, currency);
    }

    /**
     * Get user balance
     */
    async getUserBalance(userId: string, currency: string = 'INR'): Promise<number> {
        return this.getAccountBalance(`${DoubleEntryService.USER_ACCOUNT_PREFIX}${userId}`, currency);
    }

    /**
     * Validate accounting integrity
     * Total debits should equal total credits
     */
    async validateIntegrity(currency: string = 'INR'): Promise<boolean> {
        const entries = await prisma.accountEntry.findMany({
            where: { currency },
        });

        let totalDebits = 0;
        let totalCredits = 0;

        for (const entry of entries) {
            if (entry.type === 'DEBIT') {
                totalDebits += entry.amount;
            } else {
                totalCredits += entry.amount;
            }
        }

        const isValid = Math.abs(totalDebits - totalCredits) < 0.01; // Allow for floating point errors

        console.log(`[DoubleEntry] Integrity check: Debits=${totalDebits}, Credits=${totalCredits}, Valid=${isValid}`);

        return isValid;
    }

    /**
     * Get account statement
     */
    async getAccountStatement(
        accountId: string,
        limit: number = 100
    ): Promise<AccountEntry[]> {
        const entries = await prisma.accountEntry.findMany({
            where: { accountId },
            orderBy: { timestamp: 'desc' },
            take: limit,
        });

        return entries as AccountEntry[];
    }
}

export default new DoubleEntryService();
