import { Router } from 'express';
import { prisma } from '../services/db.service';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/public/directory
 * Returns a list of all registered users (phone and public key only).
 * This allows users to find each other for P2P transfers.
 */
router.get('/directory', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                phone: true,
                publicKey: true,
                displayName: true,
                status: true,
                lastSeenAt: true,
            },
            where: {
                isFrozen: false,
                phone: { notIn: ['BANK_VAULT', 'BANK_ADMIN'] }
            },
            orderBy: {
                phone: 'asc'
            }
        });

        logger.info(`[PUBLIC] Directory fetched: ${users.length} users`);
        res.json(users);
    } catch (e: any) {
        logger.error(`[PUBLIC] Directory error: ${e.message}`);
        res.status(500).json({ error: 'Failed to fetch directory' });
    }
});

export default router;
