import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import emailService from '../services/emailService';
import logger from '../utils/logger';
import { supabase } from '../lib/supabase';
import { normalizeEmail } from '../utils/auth';

const router = Router();

type OtpPurpose = 'login' | 'register' | 'transaction' | 'reset';
const validPurposes = new Set<OtpPurpose>(['login', 'register', 'transaction', 'reset']);

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

async function sendOtpEmailInBackground(
  email: string,
  otp: string,
  purpose: OtpPurpose,
  otpId: string,
) {
  try {
    const sent = await emailService.sendOTP(email, otp, purpose);
    if (sent) {
      logger.info(`[EMAIL][SUPABASE] OTP delivered to ${email} (${otpId})`);
    } else {
      logger.warn(`[EMAIL][SUPABASE] OTP delivery failed for ${email} (${otpId})`);
    }
  } catch (error: any) {
    logger.warn(`[EMAIL][SUPABASE] Background OTP send failed for ${email} (${otpId}): ${error?.message ?? error}`);
  }
}

async function findUserByEmail(email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, wallet_id, email')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const emailRaw = req.body?.email?.toString();
    const purposeRaw = req.body?.purpose?.toString().trim().toLowerCase() as OtpPurpose | undefined;

    if (!emailRaw || !purposeRaw || !validPurposes.has(purposeRaw)) {
      return res.status(400).json({
        success: false,
        error: 'Email and valid purpose are required',
      });
    }

    const email = normalizeEmail(emailRaw);
    const existingUser = await findUserByEmail(email);

    if (purposeRaw === 'register' && existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Email is already registered. Please login instead.',
      });
    }

    if ((purposeRaw === 'login' || purposeRaw === 'reset') && !existingUser) {
      return res.status(404).json({
        success: false,
        error: 'No account found for this email address',
      });
    }

    const otp = emailService.generateOTP();
    const otpId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { error: invalidateError } = await supabase
      .from('otp_codes')
      .update({ consumed_at: now })
      .eq('email', email)
      .eq('purpose', purposeRaw)
      .is('consumed_at', null)
      .gt('expires_at', now);

    if (invalidateError) throw invalidateError;

    const { error: insertError } = await supabase.from('otp_codes').insert({
      id: otpId,
      email,
      purpose: purposeRaw,
      otp_hash: hashOtp(otp),
      expires_at: expiresAt,
      attempts: 0,
      created_at: now,
    });

    if (insertError) throw insertError;

    logger.info(`[EMAIL][SUPABASE] OTP generated for ${email} (${otpId}, ${purposeRaw})`);

    // Attempt to send email in background
    const smtpStatus = emailService.getStatus();
    void sendOtpEmailInBackground(email, otp, purposeRaw, otpId);

    // If SMTP is not ready (e.g. Render port restrictions), return OTP directly
    // so the Flutter app can auto-fill it. This maintains usability.
    const returnOtp = !smtpStatus.smtpReady;
    if (returnOtp) {
      logger.warn(`[EMAIL][SUPABASE] SMTP unavailable — returning OTP in response for ${email}`);
    }

    return res.json({
      success: true,
      message: returnOtp
        ? `OTP code: ${otp} (email delivery unavailable, use this code)`
        : 'OTP sent to your email. Check your inbox.',
      otpId,
      expiresIn: 600,
      // Return OTP in response when email delivery is unavailable
      otp: returnOtp ? otp : undefined,
    });
  } catch (error: any) {
    logger.error(`[EMAIL][SUPABASE] send-otp failed: ${error?.message ?? error}`);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const emailRaw = req.body?.email?.toString();
    const otp = req.body?.otp?.toString();
    const otpId = req.body?.otpId?.toString();
    const purposeRaw = req.body?.purpose?.toString().trim().toLowerCase() as OtpPurpose | undefined;

    if (!emailRaw || !otp || !otpId || !purposeRaw || !validPurposes.has(purposeRaw)) {
      return res.status(400).json({
        success: false,
        error: 'Email, OTP, OTP ID, and valid purpose are required',
      });
    }

    const email = normalizeEmail(emailRaw);
    const { data: otpRecord, error } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('id', otpId)
      .maybeSingle();

    if (error) throw error;

    const now = new Date();
    if (
      !otpRecord ||
      otpRecord.email !== email ||
      otpRecord.purpose !== purposeRaw ||
      otpRecord.consumed_at ||
      new Date(otpRecord.expires_at).getTime() <= now.getTime()
    ) {
      return res.status(400).json({
        success: false,
        error: 'OTP expired or invalid OTP ID',
      });
    }

    const attempts = Number(otpRecord.attempts ?? 0);
    if (attempts >= 5) {
      await supabase
        .from('otp_codes')
        .update({ consumed_at: now.toISOString() })
        .eq('id', otpId);

      return res.status(429).json({
        success: false,
        error: 'Maximum OTP attempts exceeded. Request a new code.',
      });
    }

    if (hashOtp(otp) !== otpRecord.otp_hash) {
      await supabase
        .from('otp_codes')
        .update({ attempts: attempts + 1 })
        .eq('id', otpId);

      return res.status(400).json({
        success: false,
        error: 'Invalid OTP code',
      });
    }

    const verificationToken = `email_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const { error: updateError } = await supabase
      .from('otp_codes')
      .update({
        verified_at: now.toISOString(),
        verification_token: verificationToken,
      })
      .eq('id', otpId);

    if (updateError) throw updateError;

    return res.json({
      success: true,
      message: 'OTP verified successfully',
      verifiedAt: now.toISOString(),
      verificationToken,
    });
  } catch (error: any) {
    logger.error(`[EMAIL][SUPABASE] verify-otp failed: ${error?.message ?? error}`);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

router.post('/send-transaction-confirmation', async (req: Request, res: Response) => {
  try {
    const { email, transactionId, amount, recipient, timestamp, type } = req.body;
    if (!email || !transactionId || !amount || !recipient || !timestamp || !type) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    const sent = await emailService.sendTransactionConfirmation(email, {
      id: transactionId,
      amount: Number(amount),
      recipient: String(recipient),
      timestamp: new Date(timestamp),
      type,
    });

    return res.status(sent ? 200 : 500).json({
      success: sent,
      message: sent ? 'Transaction confirmation sent' : 'Failed to send transaction confirmation',
    });
  } catch (error: any) {
    logger.error(`[EMAIL][SUPABASE] transaction confirmation failed: ${error?.message ?? error}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/send-login-alert', async (req: Request, res: Response) => {
  try {
    const { email, device, location, ip } = req.body;
    if (!email || !device) {
      return res.status(400).json({ success: false, error: 'Email and device are required' });
    }

    const sent = await emailService.sendLoginAlert(email, {
      timestamp: new Date(),
      device,
      location,
      ip: ip || req.ip,
    });

    return res.status(sent ? 200 : 500).json({
      success: sent,
      message: sent ? 'Login alert sent' : 'Failed to send login alert',
    });
  } catch (error: any) {
    logger.error(`[EMAIL][SUPABASE] login alert failed: ${error?.message ?? error}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/send-password-reset', async (req: Request, res: Response) => {
  try {
    const emailRaw = req.body?.email?.toString();
    if (!emailRaw) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const email = normalizeEmail(emailRaw);
    const sent = await emailService.sendPasswordReset(
      email,
      `reset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    );

    return res.status(sent ? 200 : 500).json({
      success: sent,
      message: sent ? 'Password reset email sent' : 'Failed to send password reset email',
    });
  } catch (error: any) {
    logger.error(`[EMAIL][SUPABASE] password reset failed: ${error?.message ?? error}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/test-email', async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    configured: emailService.getStatus(),
  });
});

export default router;

