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
    const transactions = await UserService.getAllTransactions();
    return res.json({
      success: true,
      transactions: transactions || [],
    });
  } catch (error) {
    logger.error('[ADMIN] Transactions error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load transactions' });
  }
});

// Add money to user account
router.post('/add-money', async (req: Request, res: Response) => {
  try {
    const { userId, amount, reason = 'Admin credit' } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'User ID and positive amount are required'
      });
    }

    logger.info(`[ADMIN] Adding $${amount} to user ${userId}, reason: ${reason}`);
    const result = await UserService.addMoneyToUser(userId, amount, reason);
    return res.json(result);
  } catch (error) {
    logger.error('[ADMIN] Add money error:', error);
    return res.status(500).json({ success: false, error: 'Failed to add money' });
  }
});

// Remove money from user account
router.post('/remove-money', async (req: Request, res: Response) => {
  try {
    const { userId, amount, reason = 'Admin debit' } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'User ID and positive amount are required'
      });
    }

    logger.info(`[ADMIN] Removing $${amount} from user ${userId}, reason: ${reason}`);
    const result = await UserService.removeMoneyFromUser(userId, amount, reason);
    return res.json(result);
  } catch (error) {
    logger.error('[ADMIN] Remove money error:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove money' });
  }
});

// Get user transaction history
router.get('/user-transactions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    logger.info(`[ADMIN] Getting transaction history for user ${userId}`);
    const result = await UserService.getUserTransactionsById(userId);
    return res.json(result);
  } catch (error) {
    logger.error('[ADMIN] User transactions error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load user transactions' });
  }
});

export default router;
