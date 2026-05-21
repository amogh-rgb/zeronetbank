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

async function invalidateActiveOtpCodes(email: string, purpose: OtpPurpose, consumedAtIso: string) {
  const { error } = await supabase
    .from('otp_codes')
    .update({ consumed_at: consumedAtIso })
    .eq('email', email)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .gt('expires_at', consumedAtIso);

  if (error) {
    throw error;
  }
}

async function deliverOtpWithRetry(email: string, otp: string, purpose: OtpPurpose): Promise<boolean> {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const sent = await emailService.sendOTP(email, otp, purpose);
    if (sent) {
      return true;
    }

    if (attempt < maxAttempts) {
      logger.warn(`[EMAIL][SUPABASE] OTP delivery retry ${attempt} failed for ${email}; retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  return false;
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
    const hashed = hashOtp(otp);
    const otpId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await invalidateActiveOtpCodes(email, purposeRaw, now);

    const { error: insertError } = await supabase.from('otp_codes').insert({
      id: otpId,
      email,
      purpose: purposeRaw,
      otp_hash: hashed,
      expires_at: expiresAt,
      attempts: 0,
      created_at: now,
    });

    if (insertError) throw insertError;

    // Send the OTP email and retry once before treating delivery as failed.
    const emailSent = await deliverOtpWithRetry(email, otp, purposeRaw);

    if (!emailSent) {
      // Clean up the generated OTP code from the DB if email delivery fails
      await supabase.from('otp_codes').delete().eq('id', otpId);

      return res.status(500).json({
        success: false,
        error: 'Failed to deliver OTP email. Please ensure your backend environment variables (SMTP or GMAIL_RELAY_URL) are configured correctly on Vercel.',
      });
    }

    return res.json({
      success: true,
      message: 'OTP sent to your email. Check your inbox (and spam folder).',
      otpId,
      expiresIn: 600,
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

    // Verification Logic
    if (otpRecord.otp_hash === 'SUPABASE_AUTH_MANAGED') {
      // Verify via Supabase Auth API
      logger.info(`[EMAIL][SUPABASE] Verifying Supabase Auth OTP for ${email}`);
      
      // Try 'email' type first (standard for signInWithOtp)
      let { error: authError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });

      if (authError) {
        logger.warn(`[EMAIL][SUPABASE] Supabase Auth OTP verification ('email') failed: ${authError.message}. Trying 'signup'...`);
        // Try 'signup' type (sometimes used for new users)
        const { error: signupError } = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: 'signup',
        });
        authError = signupError;
      }

      if (authError) {
        logger.error(`[EMAIL][SUPABASE] Supabase Auth OTP verification failed: ${authError.message}`);
        await supabase
          .from('otp_codes')
          .update({ attempts: attempts + 1 })
          .eq('id', otpId);

        return res.status(400).json({
          success: false,
          error: 'Invalid or expired OTP code. Please check your email and try again.',
        });
      }
    } else {
      // Local verification (fallback)
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

