import { Router } from 'express';
import { prisma } from '../services/db.service';
import { AccountLoginSchema, AccountRegisterSchema, AccountResetPinSchema, RegisterSchema } from '../utils/validation';
import { authLimiter } from '../middleware/rateLimit.middleware';
import logger from '../utils/logger';
import { ensureSystemState } from '../services/system.service';
import { toMoneyNumber } from '../utils/money';
import { hashPin, issueVerificationToken, normalizeEmail, normalizePhone, verifyPin } from '../utils/auth';
import emailService, { EmailService } from '../services/emailService';

const router = Router();
router.use(authLimiter);

async function consumeVerifiedEmailToken(
  email: string,
  purpose: string,
  verificationToken: string,
): Promise<boolean> {
  const otpRecord = await prisma.emailOtp.findFirst({
    where: {
      email: normalizeEmail(email),
      purpose,
      verificationToken,
      verifiedAt: { not: null },
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!otpRecord) return false;

  await prisma.emailOtp.update({
    where: { id: otpRecord.id },
    data: { consumedAt: new Date() },
  });

  return true;
}

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

// POST /auth/account/register
router.post('/account/register', async (req, res) => {
  try {
    await ensureSystemState();

    const result = AccountRegisterSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: result.error.errors });
    }

    const { email, phone, displayName, publicKey, pin, verificationToken } = result.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    const existingByPhone = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    const existingByEmail = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });
    if (existingByEmail) {
      if (existingByEmail.phone === normalizedPhone) {
        return res.status(409).json({
          success: false,
          error: 'Email is already registered. Please login instead.',
        });
      }
      return res.status(409).json({
        success: false,
        error: 'Email is already registered with another account',
      });
    }

    const existingByPublicKey = await prisma.user.findUnique({
      where: { publicKey },
    });

    if (!(await consumeVerifiedEmailToken(normalizedEmail, 'register', verificationToken))) {
      return res.status(401).json({ success: false, error: 'Email verification expired or invalid. Please verify again.' });
    }

    const now = new Date();
    const pinHash = hashPin(pin);
    const canUpgradeExistingByPhone =
      existingByPhone &&
      !existingByPhone.email &&
      existingByPhone.publicKey === publicKey;
    const canUpgradeExistingByKey =
      existingByPublicKey &&
      !existingByPublicKey.email &&
      existingByPublicKey.phone === normalizedPhone;

    if (existingByPhone && !canUpgradeExistingByPhone) {
      if (normalizeEmail(existingByPhone.email || '') === normalizedEmail) {
        return res.status(409).json({
          success: false,
          error: 'Phone number is already registered. Please login instead.',
        });
      }
      return res.status(409).json({
        success: false,
        error: 'Phone number is already registered with another account',
      });
    }

    if (existingByPublicKey && !canUpgradeExistingByKey) {
      return res.status(409).json({
        success: false,
        error: 'This wallet is already linked to another account. Please login with the existing account or clear local app data before registering again.',
      });
    }

    const upserted = canUpgradeExistingByPhone || canUpgradeExistingByKey
      ? await prisma.user.update({
          where: { id: (existingByPhone || existingByPublicKey)!.id },
          data: {
            email: normalizedEmail,
            emailVerified: true,
            displayName: displayName.trim(),
            publicKey,
            pinHash,
            pinUpdatedAt: now,
            status: 'ONLINE',
            lastSeenAt: now,
          },
        })
      : await prisma.user.create({
          data: {
            phone: normalizedPhone,
            email: normalizedEmail,
            emailVerified: true,
            displayName: displayName.trim(),
            publicKey,
            pinHash,
            pinUpdatedAt: now,
            status: 'ONLINE',
            lastSeenAt: now,
            balance: 0,
            trustScore: 100,
          },
        });

    void EmailService.sendWelcomeEmail({
      username: upserted.displayName || normalizedPhone,
      vpa: normalizedPhone,
      email: normalizedEmail,
    });

    return res.json({
      success: true,
      status: 'REGISTERED',
      account: {
        phone: upserted.phone,
        email: upserted.email,
        displayName: upserted.displayName,
        publicKey: upserted.publicKey,
        balance: toMoneyNumber(upserted.balance),
        trustScore: upserted.trustScore,
        status: upserted.status,
        emailVerified: upserted.emailVerified,
      },
    });
  } catch (error: any) {
    logger.error(`[AUTH] account/register failed: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /auth/account/login
router.post('/account/login', async (req, res) => {
  try {
    await ensureSystemState();
    const result = AccountLoginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: result.error.errors });
    }

    const { email, pin, verificationToken } = result.data;
    const normalizedEmail = normalizeEmail(email);
    if (!(await consumeVerifiedEmailToken(normalizedEmail, 'login', verificationToken))) {
      return res.status(401).json({ success: false, error: 'Email verification expired or invalid. Please verify again.' });
    }

    const user = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Account not found for this email' });
    }
    if (!user.pinHash || !verifyPin(pin, user.pinHash)) {
      return res.status(401).json({ success: false, error: 'Incorrect PIN' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: 'ONLINE',
        lastSeenAt: new Date(),
        lastLoginAt: new Date(),
      },
    });

    void emailService.sendWelcomeBackEmail(updated.email || normalizedEmail, {
      username: updated.displayName || updated.phone,
      phone: updated.phone,
      balance: toMoneyNumber(updated.balance),
    });
    void emailService.sendLoginAlert(updated.email || normalizedEmail, {
      timestamp: new Date(),
      device: req.body?.device || 'ZeroNetPay App',
      location: req.body?.location || 'Unknown',
      ip: req.ip,
    });

    return res.json({
      success: true,
      message: 'Login verified',
      sessionToken: issueVerificationToken('session'),
      account: {
        phone: updated.phone,
        email: updated.email,
        displayName: updated.displayName,
        publicKey: updated.publicKey,
        balance: toMoneyNumber(updated.balance),
        trustScore: updated.trustScore,
        status: updated.status,
        emailVerified: updated.emailVerified,
      },
    });
  } catch (error: any) {
    logger.error(`[AUTH] account/login failed: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /auth/account/reset-pin
router.post('/account/reset-pin', async (req, res) => {
  try {
    await ensureSystemState();
    const result = AccountResetPinSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: result.error.errors });
    }

    const { email, newPin, verificationToken } = result.data;
    const normalizedEmail = normalizeEmail(email);
    if (!(await consumeVerifiedEmailToken(normalizedEmail, 'reset', verificationToken))) {
      return res.status(401).json({ success: false, error: 'Email verification expired or invalid. Please verify again.' });
    }

    const user = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Account not found for this email' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        pinHash: hashPin(newPin),
        pinUpdatedAt: new Date(),
        emailVerified: true,
      },
    });

    return res.json({
      success: true,
      message: 'Account PIN reset successfully. Use the new PIN to login.',
    });
  } catch (error: any) {
    logger.error(`[AUTH] account/reset-pin failed: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
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

  if (process.env.NODE_ENV !== 'production') {
    logger.info('╔══════════════════════════════════════════════╗');
    logger.info(`║  📱 OTP for ${phone}: [ ${otp} ]  ║`);
    logger.info('╚══════════════════════════════════════════════╝');
  } else {
    logger.info(`[AUTH] OTP generated for ${phone}`);
  }

  const allowOtpInResponse =
    process.env.OTP_RETURN_IN_RESPONSE == null
      ? true
      : process.env.OTP_RETURN_IN_RESPONSE.toLowerCase() === 'true';

  return res.json({
    success: true,
    message: 'OTP generated successfully',
    phone,
    expiresIn: 600,
    otp: allowOtpInResponse ? otp : undefined,
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
