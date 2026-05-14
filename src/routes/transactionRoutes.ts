import { Router } from 'express';
import { TransactionController } from '../controllers/transactionController';

const router = Router();

/**
 * Transaction Routes
 */

// POST /transactions/sync
// Sync transaction from client
router.post('/sync', TransactionController.syncTransaction);

// GET /transactions/pending/:walletId
// Get pending transactions for a wallet
router.get('/pending/:walletId', TransactionController.getPendingTransactions);

// POST /transactions/validate
// Validate transaction without storing
router.post('/validate', TransactionController.validateTransaction);

export default router;
