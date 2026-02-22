import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { json } from 'body-parser';

import AuthRoutes from './routes/auth.routes';
import WalletRoutes from './routes/wallet.routes';
import AdminRoutes from './routes/admin.routes';
import PublicRoutes from './routes/public.routes';
import EmailRoutes from './routes/email.routes';
import { adaptiveLimiter, syncLimiter, transactionLimiter } from './middleware/intelligentRateLimit.middleware';
import { cacheMiddleware, userCacheMiddleware } from './middleware/cache.middleware';
import { adminAuth } from './middleware/adminAuth.middleware';
import logger from './utils/logger';
import path from 'path';
import { ensureSystemState } from './services/system.service';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
// NOTE: Admin panel uses inline script in public/admin/index.html.
// Helmet default CSP blocks inline scripts (`script-src 'self'`), which makes
// the admin UI appear static (buttons/refresh don't work). Disable CSP here
// until admin assets are fully externalized.
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use((_req, res, next) => {
  // Ensure admin inline scripts are not blocked in local/dev runtime.
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Content-Security-Policy-Report-Only');
  next();
});
app.use(cors());
app.use(json({ limit: '10mb' })); // Allow large payloads for sync

// Health checks (must stay unthrottled for client connectivity probes)
app.get('/', (req, res) => {
  res.json({
    status: 'ACTIVE',
    service: 'ZeroNetBank Ledger Authority',
    version: '2.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP' });
});

// Apply intelligent rate limiting and caching to different endpoints
// Public endpoints with caching
app.use('/api/public/directory', cacheMiddleware(300), adaptiveLimiter);

// Auth endpoints with adaptive limiting
app.use('/auth', adaptiveLimiter);

// Wallet endpoints with specialized limiters
app.use('/wallet/sync', syncLimiter);
app.use('/wallet/transaction', transactionLimiter);
app.use('/wallet', adaptiveLimiter);

// Apply user-specific caching to sensitive endpoints
app.use('/wallet/balance', userCacheMiddleware(60));
app.use('/wallet/transactions', userCacheMiddleware(120));

// Static files for admin dashboard UI
app.use(express.static(path.join(__dirname, '../public')));
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// API routes
app.use('/auth', AuthRoutes);
app.use('/wallet', WalletRoutes); 
app.use('/api/admin', adminAuth, AdminRoutes); 
app.use('/api/public', PublicRoutes); 
app.use('/email', EmailRoutes);

// Compatibility routes (legacy app/backend clients)
// Keep this while older clients still use /api/v1/* paths.
app.use('/api/v1/auth', AuthRoutes);
app.use('/api/v1/wallet', WalletRoutes);
app.post('/api/v1/wallet/register', (req, res, next) => {
  // Alias legacy /api/v1/wallet/register -> /auth/register
  req.url = '/register';
  (AuthRoutes as any).handle(req, res, next);
});

if (require.main === module) {
  ensureSystemState()
    .catch((e) => logger.error(`System bootstrap failed: ${e}`))
    .finally(() => {
      app.listen(PORT, '0.0.0.0', () => {
        logger.info(`ZeroNetBank Authority running on http://0.0.0.0:${PORT}`);
        logger.info(`Mode: ${process.env.NODE_ENV || 'development'}`);
      });
    });
}

export default app;
