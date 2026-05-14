import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { json } from 'body-parser';

import AuthRoutes from './routes/auth.routes';
import SupabaseAuthRoutes from './routes/auth.supabase.routes';
import WalletRoutes from './routes/wallet.routes';
import SupabaseWalletRoutes from './routes/wallet.supabase.routes';
import AdminRoutes from './routes/admin.routes';
import SupabaseAdminRoutes from './routes/admin.supabase.routes';
import PublicRoutes from './routes/public.routes';
import SupabasePublicRoutes from './routes/public.supabase.routes';
import EmailRoutes from './routes/email.routes';
import SupabaseEmailRoutes from './routes/email.supabase.routes';
import PaymentRoutes from './routes/payment.routes';
import { testSupabaseConnection } from './lib/supabase';
import {
  adaptiveLimiter,
  syncLimiter,
  transactionLimiter,
} from './middleware/intelligentRateLimit.middleware';
import {
  userCacheMiddleware,
} from './middleware/cache.middleware';
import { adminAuth } from './middleware/adminAuth.middleware';
import logger from './utils/logger';
import path from 'path';
import { ensureSystemState } from './services/system.service';
import { connectPrismaWithRetry, prisma } from './services/db.service';
import emailService from './services/emailService';
import { isSupabaseMode } from './lib/runtimeMode';
import { ensureSupabaseSystemState } from './lib/supabaseSystem';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
app.set('trust proxy', 1);

const allowedOrigins = new Set(
  [
    process.env.PUBLIC_BASE_URL,
    'https://zeronetpay-bank-production.up.railway.app',
    'https://api.zeronetpay.com',
  ]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase()),
);

// Middleware
// NOTE: Admin panel still uses inline scripts in public/admin assets.
// CSP remains disabled until those assets are fully externalized.
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use((_req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Content-Security-Policy-Report-Only');
  next();
});
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow all local development origins
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:8080',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:3001',
        'capacitor://localhost',
        'ionic://localhost',
        // Production origins
        process.env.PUBLIC_BASE_URL,
        'https://zeronetpay-bank-production.up.railway.app',
        'https://api.zeronetpay.com',
      ].filter(Boolean);
      
      if (!origin) {
        callback(null, true);
        return;
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      
      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept',
      'Origin'
    ],
    optionsSuccessStatus: 204,
  }),
);
app.use(json({ limit: '10mb' }));

// Health checks (must stay unthrottled for client connectivity probes)
app.get('/', (_req, res) => {
  res.json({
    status: 'ACTIVE',
    service: 'ZeroNetBank Ledger Authority',
    version: '2.0.0',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'UP',
    email: emailService.getStatus(),
  });
});

app.get('/api/server-info', (_req, res) => {
  res.json({
    port: PORT,
    publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
    status: 'UP',
    email: emailService.getStatus(),
  });
});

// Apply rate limiting and caching
app.use('/api/public/directory', adaptiveLimiter);
app.use('/auth', adaptiveLimiter);
app.use('/wallet/sync', syncLimiter);
app.use('/wallet/transaction', transactionLimiter);
app.use('/wallet', adaptiveLimiter);
app.use('/wallet/balance', userCacheMiddleware(60));
app.use('/wallet/transactions', userCacheMiddleware(120));

// Static files for admin dashboard UI
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// Determine which wallet routes to use (Supabase or Prisma)
const useSupabase = isSupabaseMode;
const ActiveAuthRoutes = useSupabase ? SupabaseAuthRoutes : AuthRoutes;
const ActiveWalletRoutes = useSupabase ? SupabaseWalletRoutes : WalletRoutes;
const ActiveAdminRoutes = useSupabase ? SupabaseAdminRoutes : AdminRoutes;
const ActivePublicRoutes = useSupabase ? SupabasePublicRoutes : PublicRoutes;
const ActiveEmailRoutes = useSupabase ? SupabaseEmailRoutes : EmailRoutes;

if (useSupabase) {
  logger.info('[SERVER] Using Supabase for wallet operations');
  // Test Supabase connection on startup
  testSupabaseConnection().then(connected => {
    if (connected) {
      logger.info('[SERVER] Supabase connection verified');
    } else {
      logger.error('[SERVER] Supabase connection failed - falling back to Prisma');
    }
  });
} else {
  logger.info('[SERVER] Using Prisma/SQLite for wallet operations');
}

// API routes
app.use('/auth', ActiveAuthRoutes);
app.use('/wallet', ActiveWalletRoutes);
app.use('/api/admin', adminAuth, ActiveAdminRoutes);
app.use('/api/public', ActivePublicRoutes);
app.use('/', ActivePublicRoutes);
app.use('/email', ActiveEmailRoutes);
app.use('/api/payment', PaymentRoutes);

// Compatibility routes (legacy app/backend clients)
app.use('/api/v1/auth', ActiveAuthRoutes);
app.use('/api/v1/wallet', ActiveWalletRoutes);
app.post('/api/v1/wallet/register', (req, res, next) => {
  req.url = '/register';
  (ActiveAuthRoutes as any).handle(req, res, next);
});

if (require.main === module) {
  const bootstrap = useSupabase
    ? ensureSupabaseSystemState()
    : connectPrismaWithRetry().then(() => ensureSystemState());

  bootstrap
    .catch((e) => logger.error(`System bootstrap failed: ${e}`))
    .finally(() => {
      app.listen(PORT, '0.0.0.0', () => {
        logger.info(`ZeroNetBank running on port ${PORT}`);
        logger.info(`Mode: ${process.env.NODE_ENV || 'development'}`);
        // Run SMTP warmup after server starts to avoid startup blocking.
        void emailService.warmup().catch((e) => logger.warn(`Email warmup failed: ${e}`));
      });
    });
}

process.on('SIGINT', async () => {
  if (!useSupabase) {
    await prisma.$disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (!useSupabase) {
    await prisma.$disconnect();
  }
  process.exit(0);
});

export default app;
