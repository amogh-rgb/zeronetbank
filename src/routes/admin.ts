import express from 'express';
import { body } from 'express-validator';
import { AdminController } from '../controllers/AdminController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Input validation middleware
const validateAddFunds = [
  body('walletId').isString().notEmpty().withMessage('Valid wallet ID required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('reason').optional().isString().trim()
];

const validateRemoveFunds = [
  body('walletId').isString().notEmpty().withMessage('Valid wallet ID required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('reason').optional().isString().trim()
];

// Admin Dashboard
router.get('/dashboard', AdminController.getDashboard);

// User Management
router.get('/users', AdminController.getUsers);
router.get('/user/:walletId', AdminController.getUserByWallet);

// Fund Management (Critical - Atomic Operations)
router.post('/add-funds', validateAddFunds, AdminController.addFunds);
router.post('/remove-funds', validateRemoveFunds, AdminController.removeFunds);

// Admin Logs
router.get('/logs', AdminController.getLogs);

export default router;
