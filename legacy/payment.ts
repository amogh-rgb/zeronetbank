// Payment Routes
// Handles payment requests from Flutter frontend
// Acts as secure proxy to external bank API

import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { bankApiService } from '../services/bankApiService.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

/**
 * POST /api/payment/initiate
 * Initiate a payment transaction
 */
router.post(
    '/initiate',
    [
        // Validation middleware
        body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
        body('currency').isString().isLength({ min: 3, max: 3 }).withMessage('Invalid currency code'),
        body('customerPhone').isMobilePhone('any').withMessage('Invalid phone number'),
        body('description').optional().isString().trim(),
    ],
    async (req: Request, res: Response) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array(),
                });
            }

            const { amount, currency, customerPhone, description } = req.body;

            // Generate unique order ID
            const orderId = `ZNP-${Date.now()}-${uuidv4().slice(0, 8)}`;

            console.log('[PaymentRoute] Initiating payment:', {
                amount,
                currency,
                customerPhone,
                orderId,
            });

            // Call bank API service
            const result = await bankApiService.initiatePayment({
                amount,
                currency,
                customerPhone,
                description,
                orderId,
            });

            // Return response to Flutter
            if (result.success) {
                return res.status(200).json({
                    success: true,
                    data: {
                        transactionId: result.transactionId,
                        status: result.status,
                        message: result.message,
                        orderId,
                    },
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: result.error,
                });
            }
        } catch (error) {
            console.error('[PaymentRoute] Error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error. Please try again later.',
            });
        }
    }
);

/**
 * GET /api/payment/status/:transactionId
 * Check payment status
 */
router.get('/status/:transactionId', async (req: Request, res: Response) => {
    try {
        const { transactionId } = req.params;

        if (!transactionId) {
            return res.status(400).json({
                success: false,
                error: 'Transaction ID is required',
            });
        }

        console.log('[PaymentRoute] Checking status:', transactionId);

        // Call bank API service
        const result = await bankApiService.checkPaymentStatus(transactionId);

        if (result.success) {
            return res.status(200).json({
                success: true,
                data: {
                    transactionId: result.transactionId,
                    status: result.status,
                    message: result.message,
                },
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error,
            });
        }
    } catch (error) {
        console.error('[PaymentRoute] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error. Please try again later.',
        });
    }
});

/**
 * POST /api/payment/callback
 * Webhook callback from bank API (for async payment updates)
 */
router.post('/callback', async (req: Request, res: Response) => {
    try {
        console.log('[PaymentRoute] Received callback:', req.body);

        // TODO: Verify callback signature from bank
        // TODO: Update payment status in database
        // TODO: Notify user via WebSocket/push notification

        return res.status(200).json({
            success: true,
            message: 'Callback received',
        });
    } catch (error) {
        console.error('[PaymentRoute] Callback error:', error);
        return res.status(500).json({
            success: false,
            error: 'Callback processing failed',
        });
    }
});

export default router;
