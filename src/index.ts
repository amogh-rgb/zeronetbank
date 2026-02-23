import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { json } from 'body-parser';
import { createServer } from 'http';
import path from 'path';
import OTPRoutes from './routes/otp.routes';
import EmailRoutes from './routes/email.routes';
import AdminRoutes from './routes/admin.routes';
import UserRoutes from './routes/user.routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(helmet());
app.use(cors());
app.use(json());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (_req: Request, res: Response) => {
  res.json({ message: 'ZeroNetBank API v2.0' });
});

// Admin routes
app.use('/api/admin', AdminRoutes);

// User routes
app.use('/api/users', UserRoutes);

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
  const server = createServer(app);
  
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ZeroNetBank running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
