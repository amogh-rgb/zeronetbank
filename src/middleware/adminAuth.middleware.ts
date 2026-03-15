import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

function extractToken(req: Request): string | null {
    const bearer = req.headers.authorization;
    if (bearer && bearer.startsWith('Bearer ')) {
        return bearer.slice('Bearer '.length).trim();
    }
    const headerToken = req.headers['x-admin-token'];
    if (typeof headerToken === 'string' && headerToken.trim().length > 0) {
        return headerToken.trim();
    }
    return null;
}

export function adminAuth(req: Request, res: Response, next: NextFunction) {
    // TEST MODE: keep admin endpoints open in development for fast manual testing.
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    const configuredToken = process.env.ADMIN_API_TOKEN?.trim();
    const allowedTokens = new Set<string>(['change-this-admin-token']);
    if (configuredToken && configuredToken.length > 0) {
        allowedTokens.add(configuredToken);
    }

    // Allow local development if token is not configured.
    if (allowedTokens.size === 0) {
        if (process.env.NODE_ENV === 'production') {
            logger.error('[ADMIN_AUTH] Missing ADMIN_API_TOKEN in production.');
            return res.status(503).json({ error: 'Admin API unavailable: token not configured' });
        }
        return next();
    }

    const token = extractToken(req);
    if (!token || !allowedTokens.has(token)) {
        logger.warn(`[ADMIN_AUTH] Unauthorized access attempt: ${req.method} ${req.originalUrl}`);
        return res.status(401).json({ error: 'Unauthorized admin request' });
    }

    next();
}
