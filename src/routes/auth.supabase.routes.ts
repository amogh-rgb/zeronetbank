import { Router } from 'express';
import { randomUUID, createHash } from 'crypto';
import {
  AccountLoginSchema,
  AccountRegisterSchema,
  AccountResetPinSchema,
  RegisterSchema,
} from '../utils/validation';
import logger from '../utils/logger';
import { toMoneyNumber } from '../utils/money';
import {
  hashPin,
  issueVerificationToken,
  normalizeEmail,
  normalizePhone,
  verifyPin,
} from '../utils/auth';
import emailService, { EmailService } from '../services/emailService';
import { supabase } from '../lib/supabase';
import { authLimiter } from '../middleware/rateLimit.middleware';
import { ensureSupabaseSystemState } from '../lib/supabaseSystem';

const router = Router();
router.use(authLimiter);

async function consumeVerifiedEmailToken(
  email: string,
  purpose: string,
  verificationToken: string,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data: otpRecord, error } = await supabase
    .from('otp_codes')
    .select('id')
    .eq('email', email)
    .eq('purpose', purpose)
    .eq('verification_token', verificationToken)
    .is('consumed_at', null)
    .not('verified_at', 'is', null)
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (error || !otpRecord) {
    logger.warn(`[AUTH] Token consumption failed for ${email}: ${error?.message || 'Token not found or expired'}`);
    return false;
  }

  const { error: consumeError } = await supabase
    .from('otp_codes')
    .update({ consumed_at: nowIso })
    .eq('id', otpRecord.id);

  return !consumeError;
}

async function getWalletByPhone(phone: string) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getWalletByPublicKey(publicKey: string) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('public_key', publicKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getUserByEmail(email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getUserByWalletId(walletId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_id', walletId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function mapAccount(wallet: any, user: any) {
  return {
    phone: wallet.phone,
    email: user?.email ?? wallet.email ?? null,
    displayName: wallet.display_name,
    publicKey: wallet.public_key,
    balance: toMoneyNumber(wallet.balance),
    trustScore: Number(wallet.trust_score ?? 100),
    status: wallet.status ?? user?.status ?? 'ONLINE',
    emailVerified: Boolean(user?.email_verified ?? false),
  };
}

async function handleAccountRegister(req: any, res: any) {
  try {
    await ensureSupabaseSystemState();
    const result = AccountRegisterSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: result.error.errors });
    }

    const { email, phone, displayName, publicKey, pin, verificationToken } = result.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    if (!(await consumeVerifiedEmailToken(normalizedEmail, 'register', verificationToken))) {
      return res.status(401).json({ success: false, error: 'Email verification expired or invalid. Please verify again.' });
    }

    const existingUserByEmail = await getUserByEmail(normalizedEmail);
    if (existingUserByEmail) {
      return res.status(409).json({
        success: false,
        error: 'Email is already registered. Please login instead.',
      });
    }

    const existingWalletByPhone = await getWalletByPhone(normalizedPhone);
    const existingWalletByKey = await getWalletByPublicKey(publicKey);

    if (existingWalletByPhone && existingWalletByPhone.public_key !== publicKey) {
      return res.status(409).json({
        success: false,
        error: 'Phone number is already registered with another account',
      });
    }

    if (existingWalletByKey && existingWalletByKey.phone !== normalizedPhone) {
      return res.status(409).json({
        success: false,
        error: 'This wallet is already linked to another account. Please login with the existing account or clear local app data before registering again.',
      });
    }

    const wallet = existingWalletByPhone || existingWalletByKey;
    const now = new Date().toISOString();
    let finalWallet = wallet;

    if (!finalWallet) {
      const { data, error } = await supabase
        .from('wallets')
        .insert({
          wallet_id: normalizedPhone,
          phone: normalizedPhone,
          email: normalizedEmail,
          public_key: publicKey,
          display_name: displayName.trim(),
          balance: 0,
          trust_score: 100,
        })
        .select('*')
        .single();
      if (error) throw error;
      finalWallet = data;
    } else {
      const existingUser = await getUserByWalletId(finalWallet.wallet_id);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Phone number is already registered. Please login instead.',
        });
      }

      const { data, error } = await supabase
        .from('wallets')
        .update({
          email: normalizedEmail,
          display_name: displayName.trim(),
          public_key: publicKey,
          status: 'ONLINE',
          last_seen_at: now,
        })
        .eq('wallet_id', finalWallet.wallet_id)
        .select('*')
        .single();
      if (error) throw error;
      finalWallet = data;
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id: randomUUID(),
        wallet_id: finalWallet.wallet_id,
        email: normalizedEmail,
        phone: normalizedPhone,
        display_name: displayName.trim(),
        pin_hash: hashPin(pin),
        email_verified: true,
        status: 'ONLINE',
        last_seen_at: now,
      })
      .select('*')
      .single();

    if (userError) throw userError;

    void EmailService.sendWelcomeEmail({
      username: displayName.trim(),
      vpa: normalizedPhone,
      email: normalizedEmail,
    });

    return res.json({
      success: true,
      status: 'REGISTERED',
      account: mapAccount(finalWallet, user),
    });
  } catch (error: any) {
    logger.error(`[AUTH][SUPABASE] account/register failed: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handleAccountLogin(req: any, res: any) {
  try {
    await ensureSupabaseSystemState();
    const result = AccountLoginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: result.error.errors });
    }

    const { email, pin, verificationToken } = result.data;
    const normalizedEmail = normalizeEmail(email);

    if (!(await consumeVerifiedEmailToken(normalizedEmail, 'login', verificationToken))) {
      return res.status(401).json({ success: false, error: 'Email verification expired or invalid. Please verify again.' });
    }

    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Account not found for this email' });
    }
    if (!verifyPin(pin, user.pin_hash)) {
      return res.status(401).json({ success: false, error: 'Incorrect PIN' });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('wallet_id', user.wallet_id)
      .single();
    if (walletError || !wallet) throw walletError ?? new Error('Wallet not found');

    const now = new Date().toISOString();
    await supabase
      .from('users')
      .update({
        email_verified: true,
        status: 'ONLINE',
        last_seen_at: now,
        last_login_at: now,
      })
      .eq('id', user.id);

    await supabase
      .from('wallets')
      .update({
        status: 'ONLINE',
        last_seen_at: now,
      })
      .eq('wallet_id', wallet.wallet_id);

    void emailService.sendWelcomeBackEmail(normalizedEmail, {
      username: wallet.display_name || wallet.phone,
      phone: wallet.phone,
      balance: toMoneyNumber(wallet.balance),
    });
    void emailService.sendLoginAlert(normalizedEmail, {
      timestamp: new Date(),
      device: req.body?.device || 'ZeroNetPay App',
      location: req.body?.location || 'Unknown',
      ip: req.ip,
    });

    return res.json({
      success: true,
      message: 'Login verified',
      sessionToken: issueVerificationToken('session'),
      account: mapAccount(wallet, { ...user, email_verified: true }),
    });
  } catch (error: any) {
    logger.error(`[AUTH][SUPABASE] account/login failed: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

router.post('/register', async (req, res) => {
  try {
    await ensureSupabaseSystemState();
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid input', details: result.error.errors });
    }

    const { phone, publicKey, displayName } = result.data;
    const normalizedPhone = normalizePhone(phone);
    const now = new Date().toISOString();

    const existingByPhone = await getWalletByPhone(normalizedPhone);
    if (existingByPhone) {
      const { data, error } = await supabase
        .from('wallets')
        .update({
          public_key: publicKey,
          display_name: displayName?.trim() || existingByPhone.display_name,
          status: 'ONLINE',
          last_seen_at: now,
        })
        .eq('wallet_id', existingByPhone.wallet_id)
        .select('*')
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        status: existingByPhone.public_key === publicKey ? 'EXISTING' : 'KEY_ROTATED',
        wallet: {
          phone: data.phone,
          displayName: data.display_name,
          balance: toMoneyNumber(data.balance),
          trustScore: Number(data.trust_score ?? 100),
          status: data.status,
          lastSeenAt: data.last_seen_at,
        },
      });
    }

    const existingByKey = await getWalletByPublicKey(publicKey);
    if (existingByKey) {
      const { data, error } = await supabase
        .from('wallets')
        .update({
          wallet_id: normalizedPhone,
          phone: normalizedPhone,
          display_name: displayName?.trim() || existingByKey.display_name,
          status: 'ONLINE',
          last_seen_at: now,
        })
        .eq('wallet_id', existingByKey.wallet_id)
        .select('*')
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        status: 'KEY_RELINKED',
        wallet: {
          phone: data.phone,
          displayName: data.display_name,
          balance: toMoneyNumber(data.balance),
          trustScore: Number(data.trust_score ?? 100),
          status: data.status,
          lastSeenAt: data.last_seen_at,
        },
      });
    }

    const { data, error } = await supabase
      .from('wallets')
      .insert({
        wallet_id: normalizedPhone,
        phone: normalizedPhone,
        public_key: publicKey,
        display_name: displayName?.trim() || normalizedPhone,
        balance: 0,
        trust_score: 100,
      })
      .select('*')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      status: 'CREATED',
      wallet: {
        phone: data.phone,
        displayName: data.display_name,
        balance: toMoneyNumber(data.balance),
        trustScore: Number(data.trust_score ?? 100),
        status: data.status,
        lastSeenAt: data.last_seen_at,
      },
    });
  } catch (error: any) {
    logger.error(`[AUTH][SUPABASE] register failed: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/account/register', handleAccountRegister);

router.post('/signup', handleAccountRegister);

router.post('/account/login', handleAccountLogin);

router.post('/login', handleAccountLogin);

router.post('/account/reset-pin', async (req, res) => {
  try {
    await ensureSupabaseSystemState();
    const result = AccountResetPinSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: result.error.errors });
    }

    const { email, newPin, verificationToken } = result.data;
    const normalizedEmail = normalizeEmail(email);

    if (!(await consumeVerifiedEmailToken(normalizedEmail, 'reset', verificationToken))) {
      return res.status(401).json({ success: false, error: 'Email verification expired or invalid. Please verify again.' });
    }

    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Account not found for this email' });
    }

    const { error } = await supabase
      .from('users')
      .update({
        pin_hash: hashPin(newPin),
        email_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) throw error;

    return res.json({
      success: true,
      message: 'Account PIN reset successfully. Use the new PIN to login.',
    });
  } catch (error: any) {
    logger.error(`[AUTH][SUPABASE] account/reset-pin failed: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

function makeOtp(len = 6): string {
  let otp = '';
  for (let i = 0; i < len; i++) otp += Math.floor(Math.random() * 10);
  return otp;
}

// POST /otp/send-phone
router.post('/otp/send-phone', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || String(phoneNumber).trim().length < 6) {
      return res.status(400).json({ success: false, error: 'Valid phone number required' });
    }

    const phone = normalizePhone(String(phoneNumber));
    const otp = makeOtp(6);
    const otpId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await supabase
      .from('phone_otp_codes')
      .update({ consumed_at: now })
      .eq('phone', phone)
      .is('consumed_at', null)
      .gt('expires_at', now);

    const { error: insertError } = await supabase.from('phone_otp_codes').insert({
      id: otpId,
      phone,
      otp_hash: hashOtp(otp),
      expires_at: expiresAt,
      attempts: 0,
      created_at: now,
    });

    if (insertError) throw insertError;

    if (process.env.NODE_ENV !== 'production') {
      logger.info('╔══════════════════════════════════════════════╗');
      logger.info(`║  📱 OTP for ${phone}: [ ${otp} ]  ║`);
      logger.info('╚══════════════════════════════════════════════╝');
    } else {
      logger.info(`[AUTH][SUPABASE] OTP generated for ${phone}`);
    }

    const allowOtpInResponse = process.env.OTP_RETURN_IN_RESPONSE == null 
      ? true 
      : process.env.OTP_RETURN_IN_RESPONSE.toLowerCase() === 'true';

    return res.json({
      success: true,
      message: 'OTP generated successfully',
      phone,
      expiresIn: 600,
      otp: allowOtpInResponse ? otp : undefined,
    });
  } catch (error: any) {
    logger.error(`[AUTH][SUPABASE] send-phone failed: ${error?.message ?? error}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /otp/verify-phone
router.post('/otp/verify-phone', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ success: false, error: 'phoneNumber and code are required' });
    }

    const phone = normalizePhone(String(phoneNumber));
    
    const nowIso = new Date().toISOString();
    const { data: otpRecord, error } = await supabase
      .from('phone_otp_codes')
      .select('*')
      .eq('phone', phone)
      .is('consumed_at', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !otpRecord) {
      return res.status(400).json({
        success: false,
        error: 'No valid OTP found for this number. Please request a new one.',
      });
    }

    const attempts = Number(otpRecord.attempts ?? 0);
    if (attempts >= 5) {
      await supabase
        .from('phone_otp_codes')
        .update({ consumed_at: nowIso })
        .eq('id', otpRecord.id);

      return res.status(429).json({
        success: false,
        error: 'Maximum OTP attempts exceeded. Request a new code.',
      });
    }

    if (hashOtp(String(code).trim()) !== otpRecord.otp_hash) {
      await supabase
        .from('phone_otp_codes')
        .update({ attempts: attempts + 1 })
        .eq('id', otpRecord.id);

      return res.status(400).json({
        success: false,
        error: 'Incorrect OTP. Try again.',
      });
    }

    await supabase
      .from('phone_otp_codes')
      .update({
        verified_at: nowIso,
        consumed_at: nowIso,
      })
      .eq('id', otpRecord.id);

    logger.info(`[AUTH][SUPABASE] ✅ OTP verified for ${phone}`);
    return res.json({
      success: true,
      message: 'Phone verified successfully',
      token: `znp_verified_${phone}_${Date.now()}`,
      phone,
    });
  } catch (error: any) {
    logger.error(`[AUTH][SUPABASE] verify-phone failed: ${error?.message ?? error}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
