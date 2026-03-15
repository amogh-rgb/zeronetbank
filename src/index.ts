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
import os from 'os';
import { ensureSystemState } from './services/system.service';
import { connectPrismaWithRetry, prisma } from './services/db.service';

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

// ── Live server info ──────────────────────────────────────────────────────
// Re-reads network interfaces on every request. Prioritises Wi-Fi over
// VMware/virtual adapters so the admin panel always shows the IP the phone
// can actually reach.
app.get('/api/server-info', (req, res) => {
  const VIRTUAL = ['vmware', 'vmnet', 'virtualbox', 'vbox', 'hyper-v',
    'bluetooth', 'isatap', 'teredo', 'loopback', 'tunnel'];

  function rank(name: string): number {
    const l = name.toLowerCase();
    if (VIRTUAL.some(k => l.includes(k))) return 3;
    if (l.includes('wi-fi') || l.includes('wifi') || l.includes('wlan') || l.includes('wireless')) return 0;
    if (l.includes('ethernet') || l.includes('eth') || l.includes('en0') || l.includes('en1')) return 1;
    return 2;
  }

  const candidates: { iface: string; address: string; rank: number }[] = [];
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const net of os.networkInterfaces()[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ iface: name, address: net.address, rank: rank(name) });
      }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);

  const primary = candidates[0];
  const primaryIp = primary?.address ?? '127.0.0.1';
  const bankUrl = `http://${primaryIp}:${PORT}`;
  const isVirtual = primary?.rank === 3;

  res.json({
    primaryIp,
    primaryIface: primary?.iface ?? 'unknown',
    port: PORT,
    bankUrl,
    isVirtualAdapter: isVirtual,
    allInterfaces: candidates.map(c => ({ iface: c.iface, address: c.address })),
    localhost: `http://localhost:${PORT}`,
  });
});
// ─────────────────────────────────────────────────────────────────────────



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
  connectPrismaWithRetry()
    .then(() => ensureSystemState())
    .catch((e) => logger.error(`System bootstrap failed: ${e}`))
    .finally(() => {
      app.listen(PORT, '0.0.0.0', () => {
        // Find local IPv4 address
        const nets = os.networkInterfaces();
        let localIp = '127.0.0.1';
        for (const name of Object.keys(nets)) {
          for (const net of nets[name]!) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
              localIp = net.address;
              break;
            }
          }
        }

        logger.info(`✅ ZeroNetBank Authority running successfully!`);
        logger.info(`========================================================`);
        logger.info(`💻 Local Access: http://localhost:${PORT}`);
        logger.info(`🌐 Network Access (Enter this in App): http://${localIp}:${PORT}`);
        logger.info(`========================================================`);
        logger.info(`Mode: ${process.env.NODE_ENV || 'development'}`);
      });
    });
}

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
