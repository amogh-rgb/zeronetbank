import { Router } from 'express';
import { prisma } from '../services/db.service';
import { RegisterSchema } from '../utils/validation';
import { authLimiter } from '../middleware/rateLimit.middleware';
import logger from '../utils/logger';
import { ensureSystemState } from '../services/system.service';
import { toMoneyNumber } from '../utils/money';

const router = Router();
router.use(authLimiter);

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    await ensureSystemState();

    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid input', details: result.error.errors });
    }

    const { phone, publicKey, displayName } = result.data;
    const now = new Date();
    const normalizedName = displayName?.trim() || null;

    const existingByPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingByPhone) {
      const updated = await prisma.user.update({
        where: { phone },
        data: {
          publicKey,
          displayName: normalizedName ?? existingByPhone.displayName,
          status: 'ONLINE',
          lastSeenAt: now,
        },
      });

      return res.json({
        success: true,
        status: existingByPhone.publicKey === publicKey ? 'EXISTING' : 'KEY_ROTATED',
        wallet: {
          phone: updated.phone,
          displayName: updated.displayName,
          balance: toMoneyNumber(updated.balance),
          trustScore: updated.trustScore,
          status: updated.status,
          lastSeenAt: updated.lastSeenAt,
        },
      });
    }

    const existingByKey = await prisma.user.findUnique({ where: { publicKey } });
    if (existingByKey) {
      const updated = await prisma.user.update({
        where: { publicKey },
        data: {
          phone,
          displayName: normalizedName ?? existingByKey.displayName,
          status: 'ONLINE',
          lastSeenAt: now,
        },
      });

      return res.json({
        success: true,
        status: 'KEY_RELINKED',
        wallet: {
          phone: updated.phone,
          displayName: updated.displayName,
          balance: toMoneyNumber(updated.balance),
          trustScore: updated.trustScore,
          status: updated.status,
          lastSeenAt: updated.lastSeenAt,
        },
      });
    }

    const created = await prisma.user.create({
      data: {
        phone,
        publicKey,
        displayName: normalizedName,
        balance: 0,
        trustScore: 100,
        status: 'ONLINE',
        lastSeenAt: now,
      },
    });

    logger.info(`[AUTH] Registered wallet ${phone}`);

    return res.json({
      success: true,
      status: 'CREATED',
        wallet: {
          phone: created.phone,
          displayName: created.displayName,
          balance: toMoneyNumber(created.balance),
          trustScore: created.trustScore,
          status: created.status,
        lastSeenAt: created.lastSeenAt,
      },
    });
  } catch (error: any) {
    logger.error(`[AUTH] register failed: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phone OTP endpoints — called by AuthApiService in the Flutter app
//   POST /auth/otp/send-phone   { phoneNumber, deviceFingerprint, purpose }
//   POST /auth/otp/verify-phone { phoneNumber, code }
// OTP is stored in-memory, logged to console, and returned in response
// so the developer can see it immediately.
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var phoneOtpStore: Record<string, { otp: string; expiresAt: number }>;
}
if (!global.phoneOtpStore) global.phoneOtpStore = {};

function makeOtp(len = 6): string {
  let otp = '';
  for (let i = 0; i < len; i++) otp += Math.floor(Math.random() * 10);
  return otp;
}

// POST /auth/otp/send-phone
router.post('/otp/send-phone', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || String(phoneNumber).trim().length < 6) {
    return res.status(400).json({ success: false, error: 'Valid phone number required' });
  }

  const phone = String(phoneNumber).trim();
  const otp = makeOtp(6);
  global.phoneOtpStore[phone] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };

  // ─── VISIBLE IN SERVER TERMINAL ──────────────────────────────────────────
  logger.info('╔══════════════════════════════════════════════╗');
  logger.info(`║  📱 OTP for ${phone}: [ ${otp} ]  ║`);
  logger.info('╚══════════════════════════════════════════════╝');
  // ─────────────────────────────────────────────────────────────────────────

  return res.json({
    success: true,
    message: 'OTP generated successfully',
    otp,          // returned so Flutter app can show it (dev mode)
    phone,
    expiresIn: 600,
  });
});

// POST /auth/otp/verify-phone
router.post('/otp/verify-phone', async (req, res) => {
  const { phoneNumber, code } = req.body;
  if (!phoneNumber || !code) {
    return res.status(400).json({ success: false, error: 'phoneNumber and code are required' });
  }

  const phone = String(phoneNumber).trim();
  const entry = global.phoneOtpStore[phone];

  if (!entry) {
    return res.status(400).json({
      success: false,
      error: 'No OTP found for this number. Please request a new one.',
    });
  }
  if (Date.now() > entry.expiresAt) {
    delete global.phoneOtpStore[phone];
    return res.status(400).json({ success: false, error: 'OTP expired. Request a new one.' });
  }
  if (String(code).trim() !== entry.otp) {
    return res.status(400).json({ success: false, error: 'Incorrect OTP. Try again.' });
  }

  delete global.phoneOtpStore[phone];
  logger.info(`[AUTH] ✅ OTP verified for ${phone}`);
  return res.json({
    success: true,
    message: 'Phone verified successfully',
    token: `znp_verified_${phone}_${Date.now()}`,
    phone,
  });
});

export default router;

