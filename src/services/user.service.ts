import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export interface UserData {
  email: string;
  password: string;
  name: string;
  mobile: string;
}

export interface TransactionData {
  from: string;
  to: string;
  amount: number;
  type: string;
  description?: string;
}

class UserService {
  // Hash password
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // Register new user
  async registerUser(userData: UserData) {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email }
      });

      if (existingUser) {
        return { success: false, message: 'Email already registered' };
      }

      const existingMobile = await prisma.user.findFirst({
        where: { phone: userData.mobile }
      });

      if (existingMobile) {
        return { success: false, message: 'Mobile number already registered' };
      }

      const hashedPassword = this.hashPassword(userData.password);

      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          displayName: userData.name,
          phone: userData.mobile,
          publicKey: crypto.randomUUID(),
          balance: 1000 // Starting balance
        }
      });

      logger.info(`[USER] New user registered: ${userData.email}`);

      return {
        success: true,
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName,
          mobile: user.phone,
          balance: user.balance
        }
      };
    } catch (error) {
      logger.error('[USER] Registration error:', error);
      return { success: false, message: 'Registration failed' };
    }
  }

  // Login user
  async loginUser(email: string, password: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const hashedPassword = this.hashPassword(password);

      if (user.password !== hashedPassword) {
        return { success: false, message: 'Invalid password' };
      }

      logger.info(`[USER] User logged in: ${email}`);

      return {
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName,
          mobile: user.phone,
          balance: user.balance,
          trustScore: user.trustScore
        }
      };
    } catch (error) {
      logger.error('[USER] Login error:', error);
      return { success: false, message: 'Login failed' };
    }
  }

  // Get user by email
  async getUserByEmail(email: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          displayName: true,
          phone: true,
          balance: true,
          trustScore: true,
          createdAt: true
        }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      return { success: true, user };
    } catch (error) {
      logger.error('[USER] Get user error:', error);
      return { success: false, message: 'Failed to get user' };
    }
  }

  // Get user transactions
  async getUserTransactions(email: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          sentTransactions: {
            include: {
              receiver: {
                select: { id: true, email: true, displayName: true }
              }
            },
            orderBy: { timestamp: 'desc' }
          },
          receivedTransactions: {
            include: {
              sender: {
                select: { id: true, email: true, displayName: true }
              }
            },
            orderBy: { timestamp: 'desc' }
          }
        }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const transactions = [
        ...user.sentTransactions.map((tx: any) => ({
          ...tx,
          type: 'sent',
          otherParty: tx.receiver
        })),
        ...user.receivedTransactions.map((tx: any) => ({
          ...tx,
          type: 'received',
          otherParty: tx.sender
        }))
      ].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return {
        success: true,
        transactions: transactions
      };
    } catch (error) {
      logger.error('[USER] Get transactions error:', error);
      return { success: false, message: 'Failed to get transactions' };
    }
  }

  // Create transaction
  async createTransaction(data: TransactionData) {
    return { success: false, message: 'Transaction creation disabled' };
  }

  // Get dashboard stats (admin)
  async getDashboardStats() {
    try {
      const [totalUsers, totalTransactions, allTransactions] = await Promise.all([
        prisma.user.count(),
        prisma.transaction.count(),
        prisma.transaction.findMany()
      ]);

      const totalBalance = allTransactions.reduce((sum, t) => {
        return sum + Number(t.amount);
      }, 0);

      const activeUsers = await prisma.user.count({
        where: {
          sentTransactions: { some: {} }
        }
      });

      return {
        success: true,
        stats: {
          totalUsers,
          totalTransactions,
          totalBalance: totalBalance.toFixed(2),
          activeUsers
        }
      };
    } catch (error) {
      logger.error('[ADMIN] Dashboard stats error:', error);
      return { success: false, message: 'Failed to fetch stats' };
    }
  }

  // Get all users (admin)
  async getAllUsers() {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          displayName: true,
          phone: true,
          balance: true,
          trustScore: true,
          createdAt: true,
          sentTransactions: {
            select: { id: true }
          },
          receivedTransactions: {
            select: { id: true }
          }
        }
      });

      return {
        success: true,
        users: users.map(user => ({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          phone: user.phone,
          balance: user.balance,
          trustScore: user.trustScore,
          createdAt: user.createdAt,
          transactionCount: user.sentTransactions.length + user.receivedTransactions.length
        }))
      };
    } catch (error) {
      logger.error('[ADMIN] Get all users error:', error);
      return { success: false, message: 'Failed to fetch users' };
    }
  }

  // Add money to user account (admin)
  async addMoneyToUser(userId: string, amount: number, reason: string = 'Admin credit') {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Update user balance
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: amount } }
      });

      // Create transaction record
      await prisma.transaction.create({
        data: {
          senderId: userId, // Self-transaction for admin credit
          receiverId: userId,
          amount: amount,
          status: 'CONFIRMED',
          signature: `admin-credit-${Date.now()}`,
          type: 'CREDIT'
        }
      });

      logger.info(`[ADMIN] Added $${amount} to user ${userId} (${user.email}), reason: ${reason}`);
      return {
        success: true,
        message: `Successfully added $${amount} to user account`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          balance: updatedUser.balance
        }
      };
    } catch (error) {
      logger.error('[ADMIN] Add money error:', error);
      return { success: false, message: 'Failed to add money to user account' };
    }
  }

  // Remove money from user account (admin)
  async removeMoneyFromUser(userId: string, amount: number, reason: string = 'Admin debit') {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (Number(user.balance) < amount) {
        return { success: false, message: 'Insufficient balance' };
      }

      // Update user balance
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: amount } }
      });

      // Create transaction record
      await prisma.transaction.create({
        data: {
          senderId: userId, // Self-transaction for admin debit
          receiverId: userId,
          amount: amount,
          status: 'CONFIRMED',
          signature: `admin-debit-${Date.now()}`,
          type: 'DEBIT'
        }
      });

      logger.info(`[ADMIN] Removed $${amount} from user ${userId} (${user.email}), reason: ${reason}`);
      return {
        success: true,
        message: `Successfully removed $${amount} from user account`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          balance: updatedUser.balance
        }
      };
    } catch (error) {
      logger.error('[ADMIN] Remove money error:', error);
      return { success: false, message: 'Failed to remove money from user account' };
    }
  }

  // Get all transactions (admin)
  async getAllTransactions() {
    try {
      const transactions = await prisma.transaction.findMany({
        include: {
          sender: {
            select: { id: true, email: true, displayName: true }
          },
          receiver: {
            select: { id: true, email: true, displayName: true }
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 100 // Limit to last 100 transactions
      });

      return transactions.map(tx => ({
        id: tx.id,
        sender: tx.sender,
        receiver: tx.receiver,
        amount: tx.amount,
        status: tx.status,
        timestamp: tx.timestamp,
        signature: tx.signature,
        type: tx.type
      }));
    } catch (error) {
      logger.error('[ADMIN] Get all transactions error:', error);
      return [];
    }
  }

  // Get user transactions (admin)
  async getUserTransactions(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          sentTransactions: {
            include: {
              receiver: {
                select: { id: true, email: true, displayName: true }
              }
            },
            orderBy: { timestamp: 'desc' }
          },
          receivedTransactions: {
            include: {
              sender: {
                select: { id: true, email: true, displayName: true }
              }
            },
            orderBy: { timestamp: 'desc' }
          }
        }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const transactions = [
        ...user.sentTransactions.map((tx: any) => ({
          ...tx,
          type: 'sent',
          otherParty: tx.receiver
        })),
        ...user.receivedTransactions.map((tx: any) => ({
          ...tx,
          type: 'received',
          otherParty: tx.sender
        }))
      ].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return {
        success: true,
        transactions: transactions
      };
    } catch (error) {
      logger.error('[ADMIN] Get user transactions error:', error);
      return { success: false, message: 'Failed to get user transactions' };
    }
  }
}

export default new UserService();
