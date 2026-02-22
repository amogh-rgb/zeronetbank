import { Router } from 'express';
import { prisma } from '../services/db.service';
import logger from '../utils/logger';
import * as os from 'os';

const router = Router();

/**
 * GET /api/public/server-info
 * Returns server connection info for QR code pairing
 */
router.get('/server-info', async (req, res) => {
    try {
        // Get all network interfaces
        const interfaces = os.networkInterfaces();
        const addresses: string[] = [];
        
        for (const [name, addrs] of Object.entries(interfaces)) {
            if (!addrs) continue;
            for (const addr of addrs) {
                // Only IPv4, skip internal/loopback
                if (addr.family === 'IPv4' && !addr.internal) {
                    addresses.push(addr.address);
                }
            }
        }
        
        const port = process.env.PORT || '3000';
        
        const serverInfo = {
            name: 'ZeroNetBank',
            version: '2.0.0',
            port: parseInt(port, 10),
            addresses: addresses,
            urls: addresses.map(ip => `http://${ip}:${port}`),
            timestamp: new Date().toISOString(),
        };
        
        logger.info(`[PUBLIC] Server info requested: ${addresses.join(', ')}`);
        res.json(serverInfo);
    } catch (e: any) {
        logger.error(`[PUBLIC] Server info error: ${e.message}`);
        res.status(500).json({ error: 'Failed to get server info' });
    }
});

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
