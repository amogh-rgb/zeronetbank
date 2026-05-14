import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import emailService from '../services/emailService';
import logger from '../utils/logger';
import { prisma } from '../services/db.service';

const router = Router();

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

async function sendOtpEmailInBackground(
  email: string,
  otp: string,
  purpose: 'login' | 'register' | 'transaction' | 'reset',
  otpId: string,
) {
  try {
    const gmailSent = await emailService.sendOTP(email, otp, purpose);
    if (gmailSent) {
      logger.info(`[EMAIL] OTP delivered via Gmail to ${email} (otpId: ${otpId})`);
    } else {
      logger.warn(`[EMAIL] OTP delivery failed via Gmail for ${email} (otpId: ${otpId})`);
    }
  } catch (error: any) {
    logger.warn(`[EMAIL] Background OTP send failed for ${email} (otpId: ${otpId}): ${error?.message ?? error}`);
  }
}

router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { email, purpose } = req.body;

    if (!email || !purpose) {
      return res.status(400).json({
        success: false,
        error: 'Email and purpose are required',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPurpose = String(purpose).trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    const validPurposes = ['login', 'register', 'transaction', 'reset'];
    if (!validPurposes.includes(normalizedPurpose)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid purpose. Must be one of: ' + validPurposes.join(', '),
      });
    }

    if (normalizedPurpose === 'register') {
      const existingAccount = await prisma.user.findFirst({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existingAccount) {
        return res.status(409).json({
          success: false,
          error: 'Email is already registered. Please login instead.',
        });
      }
    }

    if (normalizedPurpose === 'login' || normalizedPurpose === 'reset') {
      const existingAccount = await prisma.user.findFirst({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (!existingAccount) {
        return res.status(404).json({
          success: false,
          error: 'No account found for this email address',
        });
      }
    }

    const otp = emailService.generateOTP();
    const otpId = `otp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const debugReturnCode = process.env.OTP_DEBUG_RETURN_CODE === 'true';
    const debugAutoVerify = debugReturnCode &&
        process.env.OTP_DEBUG_AUTO_VERIFY === 'true' &&
        process.env.NODE_ENV !== 'production';

    await prisma.emailOtp.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { consumedAt: { not: null } },
        ],
      },
    });

    await prisma.emailOtp.updateMany({
      where: {
        email: normalizedEmail,
        purpose: normalizedPurpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await prisma.emailOtp.create({
      data: {
        id: otpId,
        email: normalizedEmail,
        purpose: normalizedPurpose,
        otpHash: hashOtp(otp),
        expiresAt,
      },
    });

    logger.info(`[EMAIL] OTP generated for ${normalizedEmail} (otpId: ${otpId}, purpose: ${normalizedPurpose})`);

    let debugVerificationToken: string | undefined;
    if (process.env.OTP_DEBUG_RETURN_CODE === 'true' && debugAutoVerify) {
      debugVerificationToken = `email_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      await prisma.emailOtp.update({
        where: { id: otpId },
        data: {
          verificationToken: debugVerificationToken,
          verifiedAt: new Date(),
        },
      });
      logger.info(`[EMAIL] OTP auto-verified for debug flow ${normalizedEmail} (otpId: ${otpId})`);
    }

    void sendOtpEmailInBackground(
      normalizedEmail,
      otp,
      normalizedPurpose as 'login' | 'register' | 'transaction' | 'reset',
      otpId,
    );

    return res.status(200).json({
      success: true,
      message: 'OTP generated. Check your email inbox shortly.',
      otpId,
      expiresIn: 600,
      ...(debugReturnCode ? { otp } : {}),
      ...(debugVerificationToken != null
          ? { verificationToken: debugVerificationToken, autoVerified: true }
          : {}),
    });
  } catch (error) {
    logger.error('Send OTP error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { email, otp, otpId, purpose } = req.body;

    if (!email || !otp || !otpId || !purpose) {
      return res.status(400).json({
        success: false,
        error: 'Email, OTP, OTP ID, and purpose are required',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPurpose = String(purpose).trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    const validPurposes = ['login', 'register', 'transaction', 'reset'];
    if (!validPurposes.includes(normalizedPurpose)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid purpose',
      });
    }

    const otpRecord = await prisma.emailOtp.findUnique({
      where: { id: String(otpId) },
    });

    if (
      !otpRecord ||
      otpRecord.email !== normalizedEmail ||
      otpRecord.purpose !== normalizedPurpose ||
      otpRecord.expiresAt.getTime() <= Date.now() ||
      otpRecord.consumedAt
    ) {
      logger.warn(`OTP verify rejected for ${normalizedEmail}: invalid record, expired record, mismatched email/purpose, or already consumed (otpId: ${otpId})`);
      return res.status(400).json({
        success: false,
        error: 'OTP expired or invalid OTP ID',
      });
    }

    if ((otpRecord.attempts ?? 0) >= 5) {
      await prisma.emailOtp.update({
        where: { id: otpRecord.id },
        data: {
          consumedAt: otpRecord.consumedAt ?? new Date(),
        },
      });

      logger.warn(`OTP verify rejected for ${normalizedEmail}: max attempts exceeded (otpId: ${otpRecord.id})`);
      return res.status(429).json({
        success: false,
        error: 'Maximum OTP attempts exceeded. Request a new code.',
      });
    }

    if (hashOtp(String(otp)) !== otpRecord.otpHash) {
      await prisma.emailOtp.update({
        where: { id: otpRecord.id },
        data: {
          attempts: { increment: 1 },
        },
      });

      logger.warn(`OTP verify rejected for ${normalizedEmail}: invalid OTP code (otpId: ${otpRecord.id})`);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP code',
      });
    }

    const verificationToken = `email_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    await prisma.emailOtp.update({
      where: { id: otpRecord.id },
      data: {
        verificationToken,
        verifiedAt: new Date(),
      },
    });

    logger.info(`OTP verified successfully for ${normalizedEmail} (otpId: ${otpRecord.id})`);

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      verifiedAt: new Date().toISOString(),
      verificationToken,
    });
  } catch (error) {
    logger.error('Verify OTP error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Send transaction confirmation endpoint
router.post('/send-transaction-confirmation', async (req: Request, res: Response) => {
  try {
    const { email, transactionId, amount, recipient, timestamp, type } = req.body;

    // Validate input
    if (!email || !transactionId || !amount || !recipient || !timestamp || !type) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required',
      });
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount',
      });
    }

    // Validate type
    const validTypes = ['sent', 'received'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction type',
      });
    }

    const transactionDetails = {
      id: transactionId,
      amount: amount,
      recipient: recipient,
      timestamp: new Date(timestamp),
      type: type as 'sent' | 'received',
    };

    // Send confirmation email
    const emailSent = await emailService.sendTransactionConfirmation(email, transactionDetails);

    if (emailSent) {
      return res.status(200).json({
        success: true,
        message: 'Transaction confirmation sent',
        transactionId: transactionId,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send transaction confirmation',
      });
    }
  } catch (error) {
    logger.error('Send transaction confirmation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Send login alert endpoint
router.post('/send-login-alert', async (req: Request, res: Response) => {
  try {
    const { email, device, location, ip } = req.body;

    // Validate input
    if (!email || !device) {
      return res.status(400).json({
        success: false,
        error: 'Email and device are required',
      });
    }

    const loginDetails = {
      timestamp: new Date(),
      device: device,
      location: location || 'Unknown',
      ip: ip || req.ip,
    };

    // Send login alert email
    const emailSent = await emailService.sendLoginAlert(email, loginDetails);

    if (emailSent) {
      return res.status(200).json({
        success: true,
        message: 'Login alert sent',
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send login alert',
      });
    }
  } catch (error) {
    logger.error('Send login alert error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Send password reset endpoint
router.post('/send-password-reset', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    // Generate reset token
    const resetToken = Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9);

    // Send password reset email
    const emailSent = await emailService.sendPasswordReset(email, resetToken);

    if (emailSent) {
      return res.status(200).json({
        success: true,
        message: 'Password reset email sent',
        resetToken: resetToken,
        expiresIn: 1800, // 30 minutes in seconds
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send password reset email',
      });
    }
  } catch (error) {
    logger.error('Send password reset error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Test email configuration endpoint (Original)
router.get('/test-email', async (req: Request, res: Response) => {
  try {
    const testInfo = emailService.getTestAccountInfo();

    if (testInfo) {
      return res.status(200).json({
        success: true,
        message: 'Email service configured',
        testAccount: testInfo.user,
      });
    } else {
      return res.status(200).json({
        success: true,
        message: 'Email service configured and ready',
      });
    }
  } catch (error) {
    logger.error('Test email error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DIRECT EMAIL TEST (Requested by user)
router.get('/test', async (req: Request, res: Response) => {
  console.log("Testing direct SendGrid delivery router");
  try {
    // Manually trigger the service test method which attempts a push to fromEmail
    await emailService.testEmailConfiguration();
    
    // Attempt sending an OTP just to verify success logs
    const testDest = process.env.SENDGRID_FROM_EMAIL || 'zeronetpay0@gmail.com';
    const sent = await emailService.sendOTP(testDest, '123456', 'login');
    
    if (sent) {
      console.log("SendGrid success response captured on GET /email/test");
      return res.status(200).json({
        success: true,
        message: 'Test email delivered via SendGrid successfully',
      });
    } else {
      console.error("SendGrid error response captured on GET /email/test");
      return res.status(500).json({
        success: false,
        error: 'SendGrid failed to deliver test email',
      });
    }
  } catch (error: any) {
    console.error("SendGrid error:", error.response?.body || error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

export default router;

