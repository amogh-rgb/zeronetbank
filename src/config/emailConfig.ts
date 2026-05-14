import dotenv from 'dotenv';
dotenv.config();

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

export const emailConfig = {
  user: process.env.EMAIL_USER || '',
  pass: process.env.EMAIL_PASS || '',
  service: 'SMTP' as const,
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseIntEnv('EMAIL_PORT', 587),
  secure: parseBoolEnv('EMAIL_SECURE', false),
  connectionTimeout: parseIntEnv('EMAIL_CONNECTION_TIMEOUT_MS', 30000),
  greetingTimeout: parseIntEnv('EMAIL_GREETING_TIMEOUT_MS', 30000),
  socketTimeout: parseIntEnv('EMAIL_SOCKET_TIMEOUT_MS', 60000),
  fromEmail: process.env.EMAIL_USER || 'zeronetpay0@gmail.com',
  fromName: process.env.EMAIL_FROM_NAME || 'ZeroNetPay',
};

export default emailConfig;
