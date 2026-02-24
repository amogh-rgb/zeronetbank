import express, { Request, Response } from 'express';
import UserService from '../services/user.service';
import logger from '../utils/logger';

const router = express.Router();

// Admin dashboard data
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    logger.info('[ADMIN] Dashboard accessed');
    // Return dummy stats for now
    const result = {
      success: true,
      stats: {
        totalUsers: 0,
        totalTransactions: 0,
        totalBalance: '0.00',
        activeUsers: 0
      }
    };
    return res.json(result);
  } catch (error) {
    logger.error('[ADMIN] Dashboard error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

// Get all users
router.get('/users', async (_req: Request, res: Response) => {
  try {
    logger.info('[ADMIN] Users list accessed');
    // Return dummy users for now
    const result = {
      success: true,
      users: []
    };
    return res.json(result);
  } catch (error) {
    logger.error('[ADMIN] Users error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load users' });
  }
});

// Get transactions
router.get('/transactions', async (_req: Request, res: Response) => {
  try {
    logger.info('[ADMIN] Transactions accessed');
    return res.json({
      success: true,
      transactions: [],
      message: 'Transactions list'
    });
  } catch (error) {
    logger.error('[ADMIN] Transactions error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load transactions' });
  }
});

export default router;
