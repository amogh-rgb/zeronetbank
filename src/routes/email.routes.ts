import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import logger from '../utils/logger';

const router = express.Router();

// In-memory OTP storage (use Redis in production)
const otpStore = new Map<string, { otp: string; expires: number; type: string }>();

// Make otpStore globally accessible
(global as any).otpStore = otpStore;

// Create Gmail transporter using app password
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'zeronetpay0@gmail.com',
    pass: 'cxcx zmlz udoo vrzi', // App password
  },
});

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via email
router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { email, type = 'verification' } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpId = crypto.randomUUID();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(otpId, { otp, expires, type });

    // Send email
    const mailOptions = {
      from: 'ZeroNetPay <zeronetpay0@gmail.com>',
      to: email,
      subject: type === 'recovery' ? 'PIN Recovery OTP - ZeroNetPay' : 'Email Verification - ZeroNetPay',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #1565C0; margin-bottom: 20px;">${type === 'recovery' ? '🔐 PIN Recovery' : '✉️ Email Verification'}</h2>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              Hello,
            </p>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              ${type === 'recovery' 
                ? 'You requested a PIN recovery for your ZeroNetPay wallet.' 
                : 'Thank you for registering with ZeroNetPay. Please verify your email address.'}
            </p>
            <div style="background: #E3F2FD; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <p style="font-size: 14px; color: #666; margin-bottom: 10px;">Your verification code:</p>
              <h1 style="font-size: 36px; color: #1565C0; margin: 0; letter-spacing: 8px;">${otp}</h1>
            </div>
            <p style="font-size: 14px; color: #666;">
              This code will expire in <strong>10 minutes</strong>.
            </p>
            <p style="font-size: 14px; color: #999; margin-top: 30px;">
              If you didn't request this code, please ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #999; text-align: center;">
              ZeroNetPay - Secure Digital Wallet<br>
              This is an automated email. Please do not reply.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`[Email] OTP sent to ${email}, type: ${type}`);

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      otpId: otpId,
    });
  } catch (error) {
    logger.error('[Email] Failed to send OTP:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { email, otp, otpId, type = 'verification' } = req.body;

    if (!email || !otp || !otpId) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and OTP ID are required',
      });
    }

    const stored = otpStore.get(otpId);

    if (!stored) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    if (String(stored.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    if (Date.now() > stored.expires) {
      otpStore.delete(otpId);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired',
      });
    }

    // OTP verified successfully
    otpStore.delete(otpId);
    logger.info(`[Email] OTP verified for ${email}`);

    return res.json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    logger.error('[Email] OTP verification failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Verification failed',
    });
  }
});

// Send welcome email
router.post('/send-welcome', async (req: Request, res: Response) => {
  try {
    const { email, name, walletId } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email and name are required',
      });
    }

    const mailOptions = {
      from: 'ZeroNetPay <zeronetpay0@gmail.com>',
      to: email,
      subject: 'Welcome to ZeroNetPay!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #1565C0; margin-bottom: 20px;">🎉 Welcome to ZeroNetPay!</h2>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              Hello ${name},
            </p>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              Your wallet has been created successfully. You can now send and receive money securely.
            </p>
            <div style="background: #E8F5E9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="font-size: 14px; color: #2E7D32; margin: 0;">
                <strong>Wallet ID:</strong> ${walletId || 'N/A'}<br>
                <strong>Status:</strong> Active
              </p>
            </div>
            <p style="font-size: 14px; color: #666;">
              Features available:<br>
              ✓ Offline transactions<br>
              ✓ QR code payments<br>
              ✓ Bluetooth transfers<br>
              ✓ Real-time sync
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #999; text-align: center;">
              ZeroNetPay - Secure Digital Wallet
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`[Email] Welcome email sent to ${email}`);

    return res.json({
      success: true,
      message: 'Welcome email sent',
    });
  } catch (error) {
    logger.error('[Email] Welcome email failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send welcome email',
    });
  }
});

// Send transaction notification
router.post('/send-transaction', async (req: Request, res: Response) => {
  try {
    const { email, type, amount, counterparty, balance } = req.body;

    if (!email || !type || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Required fields missing',
      });
    }

    const isSent = type === 'sent';
    const subject = isSent ? 'Money Sent Successfully' : 'Money Received!';
    const color = isSent ? '#FF9800' : '#4CAF50';
    const icon = isSent ? '💸' : '💰';

    const mailOptions = {
      from: 'ZeroNetPay <zeronetpay0@gmail.com>',
      to: email,
      subject: `${icon} ${subject} - ZeroNetPay`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: ${color}; margin-bottom: 20px;">${icon} ${subject}</h2>
            <div style="background: ${isSent ? '#FFF3E0' : '#E8F5E9'}; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <p style="font-size: 14px; color: #666; margin-bottom: 10px;">Amount</p>
              <h1 style="font-size: 36px; color: ${color}; margin: 0;">₹${amount}</h1>
            </div>
            <p style="font-size: 16px; color: #333;">
              <strong>${isSent ? 'To:' : 'From:'}</strong> ${counterparty || 'Unknown'}<br>
              <strong>Time:</strong> ${new Date().toLocaleString()}<br>
              ${balance ? `<strong>Current Balance:</strong> ₹${balance}` : ''}
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #999; text-align: center;">
              ZeroNetPay - Secure Digital Wallet
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`[Email] Transaction ${type} notification sent to ${email}`);

    return res.json({
      success: true,
      message: 'Transaction email sent',
    });
  } catch (error) {
    logger.error('[Email] Transaction email failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send transaction email',
    });
  }
});

export default router;
