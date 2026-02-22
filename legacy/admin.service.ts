/**
 * Admin Service - Backend Only
 * 
 * Handles admin operations like deposits, withdrawals, and bank reserve management
 * NO UI - This is server-side only
 */

import { PrismaClient } from '@prisma/client';
import DoubleEntryService from './double-entry.service';

const prisma = new PrismaClient();

export interface AdminDepositRequest {
  userId: string;
  amount: number;
  currency?: string;
  description?: string;
  adminId: string;
}

export interface AdminWithdrawalRequest {
  userId: string;
  amount: number;
  currency?: string;
  description?: string;
  adminId: string;
}

export class AdminService {
  private doubleEntry = DoubleEntryService;

  /**
   * Deposit money to user account
   * Admin operation only
   */
  async depositToUser(request: AdminDepositRequest): Promise<void> {
    const { userId, amount, currency = 'INR', description, adminId } = request;

    console.log(`[Admin] Deposit: ${amount} ${currency} to user ${userId} by admin ${adminId}`);

    // Validate admin permissions
    await this.validateAdmin(adminId);

    // Validate amount
    if (amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    // Record deposit in double-entry ledger
    await this.doubleEntry.recordDeposit(
      userId,
      amount,
      currency,
      description || `Admin deposit by ${adminId}`
    );

    // Log admin action
    await this.logAdminAction({
      adminId,
      action: 'DEPOSIT',
      userId,
      amount,
      currency,
      description,
    });

    console.log(`[Admin] ✅ Deposit completed`);
  }

  /**
   * Withdraw money from user account
   * Admin operation only
   */
  async withdrawFromUser(request: AdminWithdrawalRequest): Promise<void> {
    const { userId, amount, currency = 'INR', description, adminId } = request;

    console.log(`[Admin] Withdrawal: ${amount} ${currency} from user ${userId} by admin ${adminId}`);

    // Validate admin permissions
    await this.validateAdmin(adminId);

    // Validate amount
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }

    // Check user balance
    const balance = await this.doubleEntry.getUserBalance(userId, currency);
    if (balance < amount) {
      throw new Error(`Insufficient balance: ${balance} ${currency}`);
    }

    // Record withdrawal in double-entry ledger
    await this.doubleEntry.recordWithdrawal(
      userId,
      amount,
      currency,
      description || `Admin withdrawal by ${adminId}`
    );

    // Log admin action
    await this.logAdminAction({
      adminId,
      action: 'WITHDRAWAL',
      userId,
      amount,
      currency,
      description,
    });

    console.log(`[Admin] ✅ Withdrawal completed`);
  }

  /**
   * Get bank reserve balance
   */
  async getBankReserve(currency: string = 'INR'): Promise<number> {
    return this.doubleEntry.getBankReserveBalance(currency);
  }

  /**
   * Get user balance
   */
  async getUserBalance(userId: string, currency: string = 'INR'): Promise<number> {
    return this.doubleEntry.getUserBalance(userId, currency);
  }

  /**
   * Get all user balances
   */
  async getAllUserBalances(currency: string = 'INR'): Promise<Map<string, number>> {
    const users = await prisma.user.findMany();
    const balances = new Map<string, number>();

    for (const user of users) {
      const balance = await this.getUserBalance(user.id, currency);
      balances.set(user.id, balance);
    }

    return balances;
  }

  /**
   * Validate accounting integrity
   */
  async validateIntegrity(currency: string = 'INR'): Promise<boolean> {
    return this.doubleEntry.validateIntegrity(currency);
  }

  /**
   * Get admin action logs
   */
  async getAdminLogs(adminId?: string, limit: number = 100): Promise<any[]> {
    const where = adminId ? { adminId } : {};

    return prisma.adminLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Validate admin permissions
   */
  private async validateAdmin(adminId: string): Promise<void> {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    if (!admin.isActive) {
      throw new Error('Admin account is inactive');
    }

    // Additional permission checks can be added here
  }

  /**
   * Log admin action
   */
  private async logAdminAction(log: {
    adminId: string;
    action: string;
    userId: string;
    amount: number;
    currency: string;
    description?: string;
  }): Promise<void> {
    try {
      await prisma.adminLog.create({
        data: {
          adminId: log.adminId,
          action: log.action,
          userId: log.userId,
          amount: log.amount,
          currency: log.currency,
          description: log.description,
          timestamp: new Date(),
        },
      });
    } catch (e) {
      console.error('[Admin] Failed to log action:', e);
      // Don't fail the operation if logging fails
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStats(currency: string = 'INR'): Promise<{
    totalUsers: number;
    totalBalance: number;
    bankReserve: number;
    totalTransactions: number;
    integrityValid: boolean;
  }> {
    const totalUsers = await prisma.user.count();
    const bankReserve = await this.getBankReserve(currency);
    const totalTransactions = await prisma.accountEntry.count();
    const integrityValid = await this.validateIntegrity(currency);

    // Calculate total user balance
    const balances = await this.getAllUserBalances(currency);
    let totalBalance = 0;
    for (const balance of balances.values()) {
      totalBalance += balance;
    }

    return {
      totalUsers,
      totalBalance,
      bankReserve,
      totalTransactions,
      integrityValid,
    };
  }
}

export default new AdminService();
