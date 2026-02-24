import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User, IUser } from '../models/User';
import { Transaction } from '../models/Transaction';
import { AdminLog } from '../models/AdminLog';
import { io } from '../server';

export class AdminController {

  // Get dashboard statistics
  static async getDashboard(req: Request, res: Response) {
    try {
      // Get real-time statistics
      const [totalUsers, totalTransactions, totalBalanceResult, todayTransactions] = await Promise.all([
        User.countDocuments(),
        Transaction.countDocuments(),
        Transaction.aggregate([
          { $match: { status: 'success' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      const totalBalance = totalBalanceResult.length > 0 ? totalBalanceResult[0].total : 0;

      res.json({
        success: true,
        data: {
          totalUsers,
          totalTransactions,
          totalBalance: Number(totalBalance.toFixed(2)),
          todayTransactions,
          activeUsers: totalUsers // For now, consider all users active
        }
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data'
      });
    }
  }

  // Get all users with pagination
  static async getUsers(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;

      const users = await User.find()
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await User.countDocuments();

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  }

  // Get user by wallet ID
  static async getUserByWallet(req: Request, res: Response) {
    try {
      const { walletId } = req.params;

      const user = await User.findOne({ walletId }).select('-passwordHash');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user's transactions
      const transactions = await Transaction.find({
        $or: [{ senderWallet: walletId }, { receiverWallet: walletId }]
      })
      .sort({ createdAt: -1 })
      .limit(100);

      res.json({
        success: true,
        data: {
          user,
          transactions
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user data'
      });
    }
  }

  // Add funds to user account (Admin action)
  static async addFunds(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { walletId, amount, reason = 'Admin credit' } = req.body;
      const adminId = req.user!.userId;

      if (!walletId || !amount || amount <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Valid wallet ID and positive amount required'
        });
      }

      // Find user
      const user = await User.findOne({ walletId }).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update balance
      const previousBalance = user.balance;
      user.balance += amount;
      await user.save({ session });

      // Create transaction record
      const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transaction = new Transaction({
        transactionId,
        senderWallet: 'SYSTEM',
        receiverWallet: walletId,
        amount,
        type: 'credit',
        mode: 'online',
        status: 'success',
        description: reason
      });
      await transaction.save({ session });

      // Log admin action
      const adminLog = new AdminLog({
        adminId,
        actionType: 'credit',
        targetWallet: walletId,
        amount,
        description: reason,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      await adminLog.save({ session });

      await session.commitTransaction();

      // Emit real-time update
      io.emit('balanceUpdated', {
        walletId,
        newBalance: user.balance,
        previousBalance,
        change: amount,
        type: 'credit',
        reason
      });

      io.emit('newTransaction', {
        transactionId,
        walletId,
        amount,
        type: 'credit',
        status: 'success'
      });

      res.json({
        success: true,
        message: `Successfully added $${amount} to ${walletId}`,
        data: {
          newBalance: user.balance,
          transactionId
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Add funds error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add funds'
      });
    } finally {
      session.endSession();
    }
  }

  // Remove funds from user account (Admin action)
  static async removeFunds(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { walletId, amount, reason = 'Admin debit' } = req.body;
      const adminId = req.user!.userId;

      if (!walletId || !amount || amount <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Valid wallet ID and positive amount required'
        });
      }

      // Find user
      const user = await User.findOne({ walletId }).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check sufficient balance
      if (user.balance < amount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance'
        });
      }

      // Update balance
      const previousBalance = user.balance;
      user.balance -= amount;
      await user.save({ session });

      // Create transaction record
      const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transaction = new Transaction({
        transactionId,
        senderWallet: walletId,
        receiverWallet: 'SYSTEM',
        amount,
        type: 'debit',
        mode: 'online',
        status: 'success',
        description: reason
      });
      await transaction.save({ session });

      // Log admin action
      const adminLog = new AdminLog({
        adminId,
        actionType: 'debit',
        targetWallet: walletId,
        amount,
        description: reason,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      await adminLog.save({ session });

      await session.commitTransaction();

      // Emit real-time update
      io.emit('balanceUpdated', {
        walletId,
        newBalance: user.balance,
        previousBalance,
        change: -amount,
        type: 'debit',
        reason
      });

      io.emit('newTransaction', {
        transactionId,
        walletId,
        amount,
        type: 'debit',
        status: 'success'
      });

      res.json({
        success: true,
        message: `Successfully removed $${amount} from ${walletId}`,
        data: {
          newBalance: user.balance,
          transactionId
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Remove funds error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove funds'
      });
    } finally {
      session.endSession();
    }
  }

  // Get admin logs
  static async getLogs(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;

      const logs = await AdminLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('adminId', 'name email');

      const total = await AdminLog.countDocuments();

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin logs'
      });
    }
  }
}
