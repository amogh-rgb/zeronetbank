import rateLimit from 'express-rate-limit';

function readIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

const authWindowMs = readIntEnv('AUTH_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000);
const authMaxRequests = readIntEnv('AUTH_RATE_LIMIT_MAX', 60);

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        status: 429,
        error: 'Too many requests, please try again later.',
    },
});

export const authLimiter = rateLimit({
    windowMs: authWindowMs,
    max: authMaxRequests,
    message: {
        status: 429,
        error: 'Too many accounts created from this IP, please try again after an hour',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
