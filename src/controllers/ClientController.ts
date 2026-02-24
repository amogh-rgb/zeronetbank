import { Request, Response } from 'express';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';

export class ClientController {

  // Get user profile
  static async getProfile(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const user = await User.findOne({ userId }).select('-passwordHash');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile'
      });
    }
  }

  // Get user balance
  static async getBalance(req: Request, res: Response) {
    try {
      const walletId = req.user!.walletId;

      const user = await User.findOne({ walletId }).select('balance walletId');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: {
          walletId: user.walletId,
          balance: user.balance
        }
      });
    } catch (error) {
      console.error('Get balance error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch balance'
      });
    }
  }

  // Get user transactions with filtering
  static async getTransactions(req: Request, res: Response) {
    try {
      const walletId = req.user!.walletId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {
        $or: [{ senderWallet: walletId }, { receiverWallet: walletId }]
      };

      // Add optional filters
      if (req.query.status) {
        filter.status = req.query.status;
      }

      if (req.query.mode) {
        filter.mode = req.query.mode;
      }

      if (req.query.type) {
        filter.type = req.query.type;
      }

      if (req.query.dateFrom || req.query.dateTo) {
        filter.createdAt = {};
        if (req.query.dateFrom) {
          filter.createdAt.$gte = new Date(req.query.dateFrom as string);
        }
        if (req.query.dateTo) {
          filter.createdAt.$lte = new Date(req.query.dateTo as string);
        }
      }

      const transactions = await Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Transaction.countDocuments(filter);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions'
      });
    }
  }

  // Get transaction statistics
  static async getTransactionStats(req: Request, res: Response) {
    try {
      const walletId = req.user!.walletId;

      const [sentStats, receivedStats] = await Promise.all([
        Transaction.aggregate([
          { $match: { senderWallet: walletId, status: 'success' } },
          {
            $group: {
              _id: null,
              totalSent: { $sum: '$amount' },
              sentCount: { $sum: 1 }
            }
          }
        ]),
        Transaction.aggregate([
          { $match: { receiverWallet: walletId, status: 'success' } },
          {
            $group: {
              _id: null,
              totalReceived: { $sum: '$amount' },
              receivedCount: { $sum: 1 }
            }
          }
        ])
      ]);

      const stats = {
        totalSent: sentStats.length > 0 ? sentStats[0].totalSent : 0,
        sentCount: sentStats.length > 0 ? sentStats[0].sentCount : 0,
        totalReceived: receivedStats.length > 0 ? receivedStats[0].totalReceived : 0,
        receivedCount: receivedStats.length > 0 ? receivedStats[0].receivedCount : 0
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get transaction stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction statistics'
      });
    }
  }
}
