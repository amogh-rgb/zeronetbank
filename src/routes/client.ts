import express from 'express';
import { ClientController } from '../controllers/ClientController';
import { authenticateToken, requireUser } from '../middleware/auth';

const router = express.Router();

// All client routes require authentication and user role
router.use(authenticateToken);
router.use(requireUser);

// User Profile
router.get('/profile', ClientController.getProfile);

// Wallet Balance (Real-time)
router.get('/balance', ClientController.getBalance);

// Transaction History with Filtering
router.get('/transactions', ClientController.getTransactions);

// Transaction Statistics
router.get('/transaction-stats', ClientController.getTransactionStats);

export default router;
