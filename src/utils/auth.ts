import crypto from 'crypto';

const SCRYPT_KEYLEN = 64;
const DASHBOARD_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  return phone.trim();
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;
  const derived = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

export function issueVerificationToken(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
}

function getDashboardSecret(): string | null {
  return process.env.USER_DASHBOARD_SECRET || process.env.ADMIN_SECRET || null;
}

export function issueUserDashboardToken(phone: string): string | null {
  const secret = getDashboardSecret();
  if (!secret) return null;

  const expiresAt = Date.now() + DASHBOARD_TOKEN_TTL_MS;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${phone}|${expiresAt}|${nonce}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return `${expiresAt}.${nonce}.${signature}`;
}

export function verifyUserDashboardToken(phone: string, token: string): boolean {
  const secret = getDashboardSecret();
  if (!secret || !token) return false;

  const [expiresAtRaw, nonce, signature] = token.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (!expiresAtRaw || !nonce || !signature || !Number.isFinite(expiresAt)) {
    return false;
  }
  if (Date.now() > expiresAt) {
    return false;
  }

  const payload = `${phone}|${expiresAt}|${nonce}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}
