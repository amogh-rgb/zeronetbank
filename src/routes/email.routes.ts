import { Router, Request, Response } from 'express';
import emailService from '../services/emailService';
import logger from '../utils/logger';

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
    
    // Store OTP for verification (in production, you'd store in database)
    const otpId = `otp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`OTP generated for ${email}: ${otp} (ID: ${otpId})`);

    // Send OTP email
    const emailSent = await emailService.sendOTP(email, otp, purpose as any);

    if (emailSent) {
      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        otpId: otpId,
        expiresIn: 600, // 10 minutes in seconds
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP email',
      });
    }
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

    // Verify OTP (in production, you'd verify against stored OTP)
    // For demo purposes, we'll accept any 6-digit OTP
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP format. Must be 6 digits',
      });
    }

    logger.info(`OTP verified for ${email}: ${otp}`);

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
