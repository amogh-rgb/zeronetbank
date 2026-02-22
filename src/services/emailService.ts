import nodemailer from 'nodemailer';
import logger from '../utils/logger';
import { emailConfig } from '../config/emailConfig';

// Email service configuration
class EmailService {
  private transporter!: nodemailer.Transporter;
  private isConfigured: boolean = false;

  constructor() {
    // Initialize with your Gmail credentials
    this.initializeTransporter();
  }

  private async initializeTransporter() {
    try {
      // Configure with your Gmail account
      this.transporter = nodemailer.createTransport({
        service: emailConfig.service,
        auth: {
          user: emailConfig.user,
          pass: emailConfig.pass,
        },
      });
      
      logger.info('Email service initialized with Gmail: zeronetpay0@gmail.com');
      this.isConfigured = true;
      
      // Test email sending
      await this.testEmailConfiguration();
      
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.isConfigured = false;
    }
  }

  // Generate OTP
  generateOTP(length: number = 6): string {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
  }

  // Send OTP for email verification
  async sendOTP(email: string, otp: string, purpose: 'login' | 'register' | 'transaction' | 'reset'): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping OTP send');
      return false;
    }

    try {
      const subject = this.getOTPSubject(purpose);
      const html = this.getOTPHTML(otp, purpose);

      const info = await this.transporter.sendMail({
        from: '"ZeroNetPay" <noreply@zeronetpay.com>',
        to: email,
        subject: subject,
        html: html,
      });

      logger.info(`OTP sent to ${email} for ${purpose}: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send OTP to ${email}:`, error);
      return false;
    }
  }

  // Send transaction confirmation
  async sendTransactionConfirmation(email: string, transactionDetails: {
    id: string;
    amount: number;
    recipient: string;
    timestamp: Date;
    type: 'sent' | 'received';
  }): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping transaction confirmation');
      return false;
    }

    try {
      const subject = `ZeroNetPay - Transaction ${transactionDetails.type === 'sent' ? 'Sent' : 'Received'}`;
      const html = this.getTransactionHTML(transactionDetails);

      const info = await this.transporter.sendMail({
        from: '"ZeroNetPay" <noreply@zeronetpay.com>',
        to: email,
        subject: subject,
        html: html,
      });

      logger.info(`Transaction confirmation sent to ${email}: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send transaction confirmation to ${email}:`, error);
      return false;
    }
  }

  // Send login alert
  async sendLoginAlert(email: string, loginDetails: {
    timestamp: Date;
    device: string;
    location?: string;
    ip?: string;
  }): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping login alert');
      return false;
    }

    try {
      const subject = 'ZeroNetPay - New Login Alert';
      const html = this.getLoginAlertHTML(loginDetails);

      const info = await this.transporter.sendMail({
        from: '"ZeroNetPay Security" <security@zeronetpay.com>',
        to: email,
        subject: subject,
        html: html,
      });

      logger.info(`Login alert sent to ${email}: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send login alert to ${email}:`, error);
      return false;
    }
  }

  // Send password reset email
  async sendPasswordReset(email: string, resetToken: string): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping password reset');
      return false;
    }

    try {
      const subject = 'ZeroNetPay - Password Reset';
      const html = this.getPasswordResetHTML(resetToken);

      const info = await this.transporter.sendMail({
        from: '"ZeroNetPay Support" <support@zeronetpay.com>',
        to: email,
        subject: subject,
        html: html,
      });

      logger.info(`Password reset sent to ${email}: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send password reset to ${email}:`, error);
      return false;
    }
  }

  // HTML templates
  private getOTPSubject(purpose: 'login' | 'register' | 'transaction' | 'reset'): string {
    switch (purpose) {
      case 'login':
        return 'ZeroNetPay - Login OTP';
      case 'register':
        return 'ZeroNetPay - Email Verification';
      case 'transaction':
        return 'ZeroNetPay - Transaction OTP';
      case 'reset':
        return 'ZeroNetPay - Password Reset OTP';
      default:
        return 'ZeroNetPay - Verification Code';
    }
  }

  private getOTPHTML(otp: string, purpose: 'login' | 'register' | 'transaction' | 'reset'): string {
    const purposeText = {
      login: 'login to your account',
      register: 'verify your email address',
      transaction: 'authorize your transaction',
      reset: 'reset your password'
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZeroNetPay Verification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1565C0; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .otp { font-size: 32px; font-weight: bold; color: #1565C0; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 4px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ZeroNetPay</h1>
            <p>Secure Digital Wallet</p>
          </div>
          <div class="content">
            <h2>Email Verification</h2>
            <p>Use the following OTP to ${purposeText[purpose]}:</p>
            <div class="otp">${otp}</div>
            <div class="warning">
              <strong>Security Notice:</strong> This OTP will expire in 10 minutes. Never share this code with anyone.
            </div>
            <p>If you didn't request this verification, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ZeroNetPay. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getTransactionHTML(transaction: {
    id: string;
    amount: number;
    recipient: string;
    timestamp: Date;
    type: 'sent' | 'received';
  }): string {
    const amount = (transaction.amount / 1000000).toFixed(2); // Convert from micros
    const action = transaction.type === 'sent' ? 'sent to' : 'received from';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZeroNetPay Transaction</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1565C0; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .transaction-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 24px; font-weight: bold; color: #1565C0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ZeroNetPay</h1>
            <p>Transaction Confirmation</p>
          </div>
          <div class="content">
            <h2>Transaction ${transaction.type === 'sent' ? 'Sent' : 'Received'}</h2>
            <div class="transaction-details">
              <p><strong>Transaction ID:</strong> ${transaction.id}</p>
              <p><strong>Amount:</strong> <span class="amount">$${amount}</span></p>
              <p><strong>${transaction.type === 'sent' ? 'Recipient' : 'Sender'}:</strong> ${transaction.recipient}</p>
              <p><strong>Date:</strong> ${transaction.timestamp.toLocaleString()}</p>
            </div>
            <p>This transaction has been successfully processed and recorded in your ledger.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ZeroNetPay. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getLoginAlertHTML(loginDetails: {
    timestamp: Date;
    device: string;
    location?: string;
    ip?: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZeroNetPay Login Alert</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ff6b6b; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Security Alert</h1>
            <p>New Login Detected</p>
          </div>
          <div class="content">
            <div class="alert">
              <strong>A new login was detected on your ZeroNetPay account:</strong>
              <ul>
                <li><strong>Time:</strong> ${loginDetails.timestamp.toLocaleString()}</li>
                <li><strong>Device:</strong> ${loginDetails.device}</li>
                ${loginDetails.location ? `<li><strong>Location:</strong> ${loginDetails.location}</li>` : ''}
                ${loginDetails.ip ? `<li><strong>IP Address:</strong> ${loginDetails.ip}</li>` : ''}
              </ul>
            </div>
            <p>If this was you, no action is needed. If you don't recognize this login, please secure your account immediately.</p>
            <p><a href="https://yourapp.com/security" style="background: #1565C0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Secure Account</a></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ZeroNetPay. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPasswordResetHTML(resetToken: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZeroNetPay Password Reset</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1565C0; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .reset-code { font-size: 24px; font-weight: bold; color: #1565C0; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ZeroNetPay</h1>
            <p>Password Reset</p>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>Use the following reset code to reset your password:</p>
            <div class="reset-code">${resetToken}</div>
            <p>This code will expire in 30 minutes. If you didn't request a password reset, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ZeroNetPay. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Test email configuration
  async testEmailConfiguration(): Promise<void> {
    try {
      const testInfo = await this.transporter.sendMail({
        from: '"ZeroNetPay" <noreply@zeronetpay.com>',
        to: emailConfig.user,
        subject: 'ZeroNetPay - Email Service Test',
        html: this.getTestEmailHTML(),
      });
      
      logger.info(`Test email sent successfully to ${emailConfig.user}: ${testInfo.messageId}`);
    } catch (error) {
      logger.error('Test email failed:', error);
    }
  }

  private getTestEmailHTML(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZeroNetPay - Email Service Test</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1565C0; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; text-align: center; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 ZeroNetPay</h1>
            <p>Email Service Configuration</p>
          </div>
          <div class="content">
            <div class="success">
              <h2>✅ Email Service Successfully Configured!</h2>
              <p>Gmail: ${emailConfig.user}</p>
              <p>Status: Active and Ready</p>
            </div>
            <h3>Features Available:</h3>
            <ul>
              <li>✅ Login OTP verification</li>
              <li>✅ Registration OTP verification</li>
              <li>✅ Transaction OTP verification</li>
              <li>✅ Password reset emails</li>
              <li>✅ Transaction confirmations</li>
              <li>✅ Login security alerts</li>
            </ul>
          </div>
          <div class="footer">
            <p>&copy; 2024 ZeroNetPay. All rights reserved.</p>
            <p>Test email sent at: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Check if email service is ready
  isReady(): boolean {
    return this.isConfigured;
  }

  // Get test account info (for development)
  getTestAccountInfo(): { user: string; url: string } | null {
    if (process.env.NODE_ENV === 'development') {
      return {
        user: 'zeronetpay0@gmail.com',
        url: 'https://ethereal.email/messages'
      };
    }
    return null;
  }
}

// Create singleton instance
const emailService = new EmailService();

export default emailService;
