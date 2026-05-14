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
    const allowedTokens = new Set<string>();
    const candidates = [
        process.env.ADMIN_SECRET,
        process.env.ADMIN_API_KEY,
        process.env.BANK_ADMIN_TOKEN,
        process.env.ADMIN_API_TOKEN,
    ];
    for (const token of candidates) {
        const normalized = token?.trim();
        if (normalized) {
            allowedTokens.add(normalized);
        }
    }

    // TEST MODE: keep admin endpoints open in development for fast manual testing.
    if (process.env.NODE_ENV !== 'production' && allowedTokens.size === 0) {
        return next();
    }

    // Allow local development if token is not configured.
    if (allowedTokens.size === 0) {
        if (process.env.NODE_ENV === 'production') {
            logger.error('[ADMIN_AUTH] Missing admin secret in production.');
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
