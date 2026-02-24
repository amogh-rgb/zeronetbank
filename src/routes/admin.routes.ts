import express, { Request, Response } from 'express';
import UserService from '../services/user.service';
import logger from '../utils/logger';

const router = express.Router();

// Admin dashboard data
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    logger.info('[ADMIN] Dashboard accessed');
    const result = await UserService.getDashboardStats();
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
    const result = await UserService.getAllUsers();
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
