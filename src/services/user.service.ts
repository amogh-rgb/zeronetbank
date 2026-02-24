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
          balance: user.balance
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
        include: {
          sentTransactions: {
            orderBy: { timestamp: 'desc' }
          },
          receivedTransactions: {
            orderBy: { timestamp: 'desc' }
          }
        }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName,
          mobile: user.phone,
          balance: user.balance,
          transactions: [...user.sentTransactions, ...user.receivedTransactions]
        }
      };
    } catch (error) {
      logger.error('[USER] Get user error:', error);
      return { success: false, message: 'Failed to get user' };
    }
  }

  // Create transaction - DISABLED for now
  async createTransaction(userId: string, transactionData: TransactionData) {
    return { success: false, message: 'Transaction creation disabled' };
    /*
    try {
      const transaction = await prisma.transaction.create({
        data: {
          from: transactionData.from,
          to: transactionData.to,
          amount: transactionData.amount,
          type: transactionData.type,
          description: transactionData.description || '',
          status: 'COMPLETED',
          userId: userId
        }
      });

      logger.info(`[TRANSACTION] Created: ${transaction.id}`);
      return { success: true, transaction };
    } catch (error) {
      logger.error('[TRANSACTION] Create error:', error);
      return { success: false, message: 'Failed to create transaction' };
    }
    */
  }

  // Get all transactions for user
  async getUserTransactions(email: string) {
    return { success: false, message: 'Transactions disabled' };
    /*
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          transactions: {
            orderBy: { timestamp: 'desc' }
          }
        }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      return {
        success: true,
        transactions: user.transactions
      };
    } catch (error) {
      logger.error('[USER] Get transactions error:', error);
      return { success: false, message: 'Failed to get transactions' };
    }
    */
  }

  // Get user statistics
  async getUserStats() {
    return { success: false, message: 'Stats disabled' };
    /*
    try {
      const stats = await prisma.user.aggregate({
        _count: { id: true },
        _sum: { balance: true },
        where: {
          transactions: { some: {} }
        }
      });

      return {
        success: true,
        stats: {
          totalUsers: stats._count.id,
          totalBalance: stats._sum.balance || 0,
          activeUsers: stats._count.id
        }
      };
    } catch (error) {
      logger.error('[USER] Stats error:', error);
      return { success: false, message: 'Failed to get stats' };
    }
    */
  }

  // Get all users (admin)
  async getAllUsers() {
    return { success: false, message: 'Users list disabled' };
    /*
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          displayName: true,
          phone: true,
          balance: true,
          createdAt: true,
          transactions: {
            select: { id: true }
          }
        }
      });

      return {
        success: true,
        users: users.map(user => ({
          ...user,
          transactionCount: user.transactions.length
        }))
      };
    } catch (error) {
      logger.error('[ADMIN] Get all users error:', error);
      return { success: false, message: 'Failed to fetch users' };
    }
  }

  // Get dashboard stats (admin)
  async getDashboardStats() {
    return { success: false, message: 'Dashboard stats disabled' };
    /*
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
          transactions: { some: {} }
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
    */
  }
}

export default new UserService();
