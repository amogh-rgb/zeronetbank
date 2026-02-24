import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { json } from 'body-parser';
import { createServer } from 'http';
import path from 'path';
import { execSync } from 'child_process';
import OTPRoutes from './routes/otp.routes';
import EmailRoutes from './routes/email.routes';
import AdminRoutes from './routes/admin.routes';
import UserRoutes from './routes/user.routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Database setup on startup
async function setupDatabase() {
  try {
    console.log('[STARTUP] Setting up database...');
    
    // Run prisma db push to ensure schema is applied
    execSync('npx prisma db push --accept-data-loss', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    console.log('[STARTUP] Database schema applied successfully');
  } catch (error) {
    console.error('[STARTUP] Database setup failed:', error);
    // Don't exit - let the app start anyway
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(json());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (_req: Request, res: Response) => {
  res.json({ message: 'ZeroNetBank API v2.0' });
});

// Admin routes
app.use('/api/admin', AdminRoutes);

// User routes
app.use('/api/users', UserRoutes);

// Wallet routes (alias for user sync)
app.use('/api/wallet', UserRoutes);

// OTP routes
app.use('/api/otp', OTPRoutes);

// Email routes
app.use('/api/email', EmailRoutes);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
if (require.main === module) {
  // Setup database before starting server
  setupDatabase().then(() => {
    const server = createServer(app);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`ZeroNetBank running on http://0.0.0.0:${PORT}`);
    });
  }).catch((error) => {
    console.error('[STARTUP] Failed to setup database, but starting server anyway:', error);
    // Start server even if database setup fails
    const server = createServer(app);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`ZeroNetBank running on http://0.0.0.0:${PORT}`);
    });
  });
}

export default app;
