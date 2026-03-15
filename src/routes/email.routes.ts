import { Router, Request, Response } from 'express';
import emailService from '../services/emailService';
import logger from '../utils/logger';

declare global {
  var otpCache: Record<string, string>;
}

const router = Router();

// Generate OTP endpoint
router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { email, purpose } = req.body;

    // Validate input
    if (!email || !purpose) {
      return res.status(400).json({
        success: false,
        error: 'Email and purpose are required',
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

    // Validate purpose
    const validPurposes = ['login', 'register', 'transaction', 'reset'];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid purpose. Must be one of: ' + validPurposes.join(', '),
      });
    }

    // Generate OTP
    const otp = emailService.generateOTP();

    // Store OTP keyed by otpId for verification
    const otpId = `otp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (!global.otpCache) global.otpCache = {};
    global.otpCache[otpId] = otp;

    // Auto-cleanup after 10 minutes
    setTimeout(() => { if (global.otpCache?.[otpId]) delete global.otpCache[otpId]; }, 600000);

    // ── ALWAYS VISIBLE IN SERVER TERMINAL ────────────────────────────────
    logger.info('╔══════════════════════════════════════════════════╗');
    logger.info(`║  📧 EMAIL OTP for ${email}`);
    logger.info(`║  Code: [ ${otp} ]  ID: ${otpId}`);
    logger.info('╚══════════════════════════════════════════════════╝');
    // ─────────────────────────────────────────────────────────────────────

    // Try to send email — don't wait for it; failure must NOT block response
    let emailDelivery = false;
    try {
      emailDelivery = await emailService.sendOTP(email, otp, purpose as any);
    } catch (err: any) {
      logger.warn(`Gmail send failed (non-fatal): ${err?.message ?? err}`);
      emailDelivery = false;
    }

    // Always return success + OTP so the Flutter app can show it directly
    return res.status(200).json({
      success: true,
      message: emailDelivery
        ? 'OTP generated and sent to email'
        : 'OTP generated (email delivery unavailable, use shown OTP)',
      otp,          // shown in app UI — remove in production SMS-only flow
      otpId,
      expiresIn: 600,
    });
  } catch (error) {
    logger.error('Send OTP error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});


// Verify OTP endpoint
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { email, otp, otpId, purpose } = req.body;

    // Validate input
    if (!email || !otp || !otpId || !purpose) {
      return res.status(400).json({
        success: false,
        error: 'Email, OTP, OTP ID, and purpose are required',
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

    // Validate purpose
    const validPurposes = ['login', 'register', 'transaction', 'reset'];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid purpose',
      });
    }

    // In memory store for OTPs (simplistic for demo but uses actual OTP)
    // NOTE: This usually requires a database or Redis cache to store 'otpId' -> 'otp' pairs securely.
    // For this implementation, since memory cache wasn't provided, 
    // we should at least block the "any 6 digit OTP" hole and require them to match their received token.
    // However, to enforce strict checking without a DB immediately, we must add a cache map here.

    // We will inject a simple memory cache above to store otpId -> otp mappings
    const storedOtp = global.otpCache ? global.otpCache[otpId] : null;

    if (!storedOtp) {
      return res.status(400).json({
        success: false,
        error: 'OTP expired or invalid OTP ID',
      });
    }

    if (otp !== storedOtp) {
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP code',
      });
    }

    // Clear the OTP from cache once verified successfully
    delete global.otpCache[otpId];

    logger.info(`OTP verified successfully for ${email}`);

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      verifiedAt: new Date().toISOString(),
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

// Test email configuration endpoint
router.get('/test-email', async (req: Request, res: Response) => {
  try {
    const testInfo = emailService.getTestAccountInfo();

    if (testInfo) {
      return res.status(200).json({
        success: true,
        message: 'Email service configured',
        testAccount: testInfo.user,
        testUrl: testInfo.url,
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

export default router;


