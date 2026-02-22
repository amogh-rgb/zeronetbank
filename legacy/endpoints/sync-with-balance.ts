/**
 * Enhanced Wallet Sync Endpoint with Balance
 * 
 * Add this to your existing bank/src/index.ts file
 * This endpoint returns balance along with transactions
 */

// Add this endpoint after the existing wallet endpoints (around line 650)

/**
 * POST /api/wallet/sync-with-balance
 * Enhanced sync endpoint that returns balance from backend
 */
app.post('/api/wallet/sync-with-balance', async (req: Request, res: Response) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Phone number required' });
        }

        // Get user from database
        const userResult = await pool.query(
            'SELECT id, phone, public_key FROM users WHERE phone = $1',
            [phone]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Get transactions
        const txResult = await pool.query(
            `SELECT id, sender_address, receiver_address, amount, timestamp, signature, nonce
       FROM transactions 
       WHERE sender_address = $1 OR receiver_address = $1
       ORDER BY timestamp DESC
       LIMIT 100`,
            [user.public_key]
        );

        // ✅ NEW: Calculate balance from backend using double-entry accounting
        let balance = 0;

        // Option 1: Use DoubleEntryService (if available)
        try {
            const DoubleEntryService = require('./services/double-entry.service').default;
            balance = await DoubleEntryService.getUserBalance(user.id, 'INR');
        } catch (e) {
            // Option 2: Calculate from transactions
            for (const tx of txResult.rows) {
                if (tx.receiver_address === user.public_key) {
                    balance += parseFloat(tx.amount);
                } else if (tx.sender_address === user.public_key) {
                    balance -= parseFloat(tx.amount);
                }
            }
        }

        // Return response with balance
        res.json({
            bankOnline: true,
            phone: user.phone,
            publicKey: user.public_key,
            transactions: txResult.rows,
            balance, // ✅ NEW: Balance from backend
            trustScore: 95,
            timestamp: Date.now(),
        });

    } catch (error: any) {
        logger.error('Sync with balance error:', error);
        res.status(500).json({
            error: 'Sync failed',
            message: error.message
        });
    }
});
