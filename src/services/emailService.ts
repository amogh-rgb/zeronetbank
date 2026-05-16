import nodemailer from 'nodemailer';
import crypto from 'crypto';
import logger from '../utils/logger';
import { emailConfig } from '../config/emailConfig';

export class EmailService {
  private transporter!: nodemailer.Transporter;
  private fallbackTransporter?: nodemailer.Transporter;
  private isConfigured = false;
  private smtpReady = false;
  private lastReadyError: string | null = null;
  private readonly readyPromise: Promise<void>;
  private static instance: EmailService;

  constructor() {
    this.readyPromise = this.initializeTransporter();
  }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private async initializeTransporter() {
    try {
      if (!emailConfig.user || !emailConfig.pass) {
        logger.warn('Email service disabled: EMAIL_USER/EMAIL_PASS not configured');
        this.isConfigured = false;
        return;
      }

      // Try all common Gmail SMTP combinations to find one that works
      // (Render free tier restricts certain outbound ports)
      this.transporter = this.createTransporter({
        host: emailConfig.host,
        port: 587,
        secure: false,
        ignoreTLS: false,
      });

      this.fallbackTransporter = this.createTransporter({
        host: emailConfig.host,
        port: 465,
        secure: true,
        ignoreTLS: false,
      });

      this.isConfigured = true;
      logger.info(`Email service initialized (${emailConfig.service})`);
      await this.verifyTransporters();
    } catch (error) {
      logger.error('Failed to initialize email service:', error as any);
      this.isConfigured = false;
      this.smtpReady = false;
      this.lastReadyError =
          error instanceof Error ? error.message : String(error);
    }
  }

  async ensureReady(): Promise<void> {
    await this.readyPromise;
  }

  async warmup(): Promise<void> {
    await this.ensureReady();
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      smtpReady: this.smtpReady,
      lastReadyError: this.lastReadyError,
      fromEmail: emailConfig.fromEmail,
      host: emailConfig.host,
      port: emailConfig.port,
    };
  }

  private createTransporter(options: { host: string; port: number; secure: boolean; ignoreTLS?: boolean }): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      ignoreTLS: options.ignoreTLS ?? false,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
      connectionTimeout: emailConfig.connectionTimeout,
      greetingTimeout: emailConfig.greetingTimeout,
      socketTimeout: emailConfig.socketTimeout,
      tls: {
        servername: options.host,
        rejectUnauthorized: false,
      },
    });
  }

  private async verifyTransporters(): Promise<void> {
    const attempts = [
      { transporter: this.transporter, label: 'primary SMTP' },
      { transporter: this.fallbackTransporter, label: 'fallback SMTP' },
    ];

    let lastError: unknown;
    for (const attempt of attempts) {
      if (!attempt.transporter) continue;
      try {
        await attempt.transporter.verify();
        this.smtpReady = true;
        this.lastReadyError = null;
        logger.info(`Email transport verified via ${attempt.label}`);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(`Email transport verify failed via ${attempt.label}`, error as any);
      }
    }

    this.smtpReady = false;
    this.lastReadyError =
      lastError instanceof Error ? lastError.message : String(lastError);
  }

  private async sendMailWithFallback(
    mailOptions: nodemailer.SendMailOptions,
    logContext: string,
  ): Promise<boolean> {
    const attempts = [
      { transporter: this.transporter, label: `${logContext} via primary SMTP` },
      { transporter: this.fallbackTransporter, label: `${logContext} via fallback SMTP` },
    ];

    let lastError: unknown;
    for (const attempt of attempts) {
      if (!attempt.transporter) continue;
      try {
        const info = await attempt.transporter.sendMail(mailOptions);
        logger.info(`${attempt.label}: ${info.messageId}`);
        return true;
      } catch (error) {
        lastError = error;
        logger.warn(`${attempt.label} failed`, error as any);
      }
    }

    logger.error(`${logContext} failed on all SMTP transports`, lastError as any);
    return false;
  }

  generateOTP(length = 6): string {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i += 1) {
      otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
  }

  static async sendOTP(email: string, otp: string, purpose: 'login' | 'register' | 'transaction' | 'reset'): Promise<boolean> {
    return EmailService.getInstance().sendOTP(email, otp, purpose);
  }

  async sendOTP(email: string, otp: string, purpose: 'login' | 'register' | 'transaction' | 'reset'): Promise<boolean> {
    console.log("Sending OTP to:", email);
    
    await this.ensureReady();
    if (!this.isConfigured) {
      console.error('[EMAIL] Email service not configured');
      return false;
    }
    
    try {
      const result = await this.sendMailWithFallback({
        from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
        to: email,
        subject: this.getOTPSubject(purpose),
        text: `Your ZeroNetPay OTP is ${otp}. It is valid for 10 minutes. Do not share this code with anyone.`,
        html: this.getOTPHTML(otp, purpose),
      }, `OTP to ${email} for ${purpose}`);
      
      if (result) {
        console.log('SMTP send success:', result);
      } else {
        console.error('SMTP send error:', new Error('Fallback returns false (see logs)'));
      }
      return result;
    } catch (error: any) {
      console.error('SMTP send error:', error.response?.body || error);
      return false;
    }
  }

  async sendTransactionConfirmation(email: string, transactionDetails: {
    id: string;
    amount: number;
    recipient: string;
    timestamp: Date;
    type: 'sent' | 'received';
  }): Promise<boolean> {
    await this.ensureReady();
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping transaction confirmation');
      return false;
    }

    return this.sendMailWithFallback({
      from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
      to: email,
      subject: `ZeroNetPay - Transaction ${transactionDetails.type === 'sent' ? 'Sent' : 'Received'}`,
      html: this.getTransactionHTML(transactionDetails),
    }, `Transaction confirmation to ${email}`);
  }

  async sendLoginAlert(email: string, loginDetails: {
    timestamp: Date;
    device: string;
    location?: string;
    ip?: string;
  }): Promise<boolean> {
    await this.ensureReady();
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping login alert');
      return false;
    }

    return this.sendMailWithFallback({
      from: `"${emailConfig.fromName} Security" <${emailConfig.fromEmail}>`,
      to: email,
      subject: 'ZeroNetPay - New Login Alert',
      html: this.getLoginAlertHTML(loginDetails),
    }, `Login alert to ${email}`);
  }

  async sendWelcomeBackEmail(email: string, payload: { username: string; phone: string; balance?: number }): Promise<boolean> {
    await this.ensureReady();
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping welcome-back email');
      return false;
    }

    return this.sendMailWithFallback({
      from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
      to: email,
      subject: 'Welcome back to ZeroNetPay',
      html: this.getWelcomeBackHTML(payload),
    }, `Welcome-back email to ${email}`);
  }

  async sendPasswordReset(email: string, resetToken: string): Promise<boolean> {
    await this.ensureReady();
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping password reset');
      return false;
    }

    return this.sendMailWithFallback({
      from: `"${emailConfig.fromName} Support" <${emailConfig.fromEmail}>`,
      to: email,
      subject: 'ZeroNetPay - Password Reset',
      html: this.getPasswordResetHTML(resetToken),
    }, `Password reset to ${email}`);
  }

  private getOTPSubject(purpose: 'login' | 'register' | 'transaction' | 'reset'): string {
    switch (purpose) {
      case 'login': return 'ZeroNetPay - Login OTP';
      case 'register': return 'ZeroNetPay - Email Verification';
      case 'transaction': return 'ZeroNetPay - Transaction OTP';
      case 'reset': return 'ZeroNetPay - PIN Reset OTP';
    }
  }

  private getOTPHTML(otp: string, purpose: 'login' | 'register' | 'transaction' | 'reset'): string {
    const purposeText = {
      login: 'login to your account',
      register: 'verify your email address',
      transaction: 'authorize your transaction',
      reset: 'reset your wallet PIN',
    }[purpose];

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ZeroNetPay OTP</title></head>
<body style="margin:0;padding:0;background:#eef4ff;font-family:Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(15,61,145,0.12);">
      <div style="background:linear-gradient(135deg,#0f3d91,#2f6bff);padding:28px;text-align:center;color:#fff;">
        <h1 style="margin:0;font-size:28px;">ZeroNetPay</h1>
        <p style="margin:10px 0 0;opacity:.9;">Secure wallet verification</p>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 18px;font-size:16px;">Use this OTP to ${purposeText}.</p>
        <div style="margin:24px 0;padding:20px;border-radius:16px;background:#f8fbff;border:1px solid #d8e7ff;text-align:center;">
          <div style="font-size:36px;letter-spacing:8px;font-weight:700;color:#1565c0;">${otp}</div>
        </div>
        <p style="margin:0 0 12px;color:#475569;">This code expires in 10 minutes.</p>
        <p style="margin:0;color:#b91c1c;font-weight:600;">Never share this OTP with anyone.</p>
      </div>
      <div style="padding:0 28px 28px;color:#64748B;font-size:12px;text-align:center;">ZeroNetPay security mail ? If you did not request this, you can ignore this email.</div>
    </div>
  </div>
</body>
</html>`;
  }

  private getTransactionHTML(transaction: { id: string; amount: number; recipient: string; timestamp: Date; type: 'sent' | 'received'; }): string {
    const amount = transaction.amount.toFixed(2);
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#eef4ff;padding:24px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;"><h2 style="color:#1565C0;">Transaction ${transaction.type === 'sent' ? 'Sent' : 'Received'}</h2><p><strong>Transaction ID:</strong> ${transaction.id}</p><p><strong>Amount:</strong> ?${amount}</p><p><strong>${transaction.type === 'sent' ? 'Recipient' : 'Sender'}:</strong> ${transaction.recipient}</p><p><strong>Date:</strong> ${transaction.timestamp.toLocaleString()}</p></div></body></html>`;
  }

  private getLoginAlertHTML(loginDetails: { timestamp: Date; device: string; location?: string; ip?: string; }): string {
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#fff7ed;padding:24px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;"><h2 style="color:#b91c1c;">New Login Alert</h2><p>We detected a login on your ZeroNetPay account.</p><ul><li><strong>Time:</strong> ${loginDetails.timestamp.toLocaleString()}</li><li><strong>Device:</strong> ${loginDetails.device}</li>${loginDetails.location ? `<li><strong>Location:</strong> ${loginDetails.location}</li>` : ''}${loginDetails.ip ? `<li><strong>IP:</strong> ${loginDetails.ip}</li>` : ''}</ul></div></body></html>`;
  }

  private getPasswordResetHTML(resetToken: string): string {
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#eef4ff;padding:24px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;"><h2 style="color:#1565C0;">Reset Your ZeroNetPay PIN</h2><p>Use the following reset code:</p><div style="font-size:28px;font-weight:700;color:#1565C0;">${resetToken}</div></div></body></html>`;
  }

  private getWelcomeBackHTML(payload: { username: string; phone: string; balance?: number }): string {
    const balanceHtml = payload.balance != null ? `<p><strong>Available balance:</strong> ?${payload.balance.toFixed(2)}</p>` : '';
    const dashboardLink = this.buildUserDashboardUrl(payload.phone);
    const dashboardHtml = dashboardLink
      ? `<p style="margin-top:16px;"><a href="${dashboardLink}" style="display:inline-block;background:#1565C0;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">Open Your ZeroNetPay Dashboard</a></p>`
      : '';
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#eef4ff;padding:24px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;"><h2 style="color:#1565C0;">Welcome back, ${payload.username}!</h2><p>Your wallet linked to <strong>${payload.phone}</strong> is ready.</p>${balanceHtml}${dashboardHtml}</div></body></html>`;
  }

  async testEmailConfiguration(): Promise<void> {
    await this.ensureReady();
    if (!this.isConfigured) return;
    try {
      const ok = await this.sendMailWithFallback({
        from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
        to: emailConfig.fromEmail,
        subject: 'ZeroNetPay - Email Service Test',
        text: 'This is a test email to verify the Gmail SMTP service is working correctly.',
        html: this.getTestEmailHTML(),
      }, 'SMTP self-test');
      if (ok) logger.info('SMTP service test successful');
      else logger.warn('SMTP service test failed');
    } catch (error) {
      logger.error('SMTP service test error:', error as any);
    }
  }

  private getTestEmailHTML(): string {
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;"><h2 style="color:#1565C0;">ZeroNetPay Email Service Test</h2><p>Gmail: ${emailConfig.fromEmail}</p><p>Status: Active and Ready</p></div></body></html>`;
  }

  static async sendOTPEmail(email: string, otp: string): Promise<{ success: boolean; message: string }> {
    try {
      const success = await EmailService.sendOTP(email, otp, 'login');
      return { success, message: success ? 'OTP sent successfully' : 'Failed to send OTP' };
    } catch (error) {
      return { success: false, message: 'Internal server error' };
    }
  }

  static async sendWelcomeEmail(user: { username: string; vpa: string; email: string }): Promise<{ success: boolean; message: string }> {
    try {
      const instance = EmailService.getInstance();
      await instance.ensureReady();
      const sent = await instance.sendMailWithFallback({
        from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
        to: user.email,
        subject: 'Welcome to ZeroNetPay!',
        html: instance.getWelcomeHTML(user),
      }, `Welcome email to ${user.email}`);
      return { success: sent, message: sent ? 'Welcome email sent successfully' : 'Failed to send welcome email' };
    } catch {
      return { success: false, message: 'Failed to send welcome email' };
    }
  }

  private getWelcomeHTML(user: { username: string; vpa: string; email: string }): string {
    const dashboardLink = this.buildUserDashboardUrl(user.vpa);
    const dashboardHtml = dashboardLink
      ? `<p style="margin-top:16px;"><a href="${dashboardLink}" style="display:inline-block;background:#1565C0;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">Open Your ZeroNetPay Dashboard</a></p>`
      : '';
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#eef4ff;padding:24px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;"><h2 style="color:#1565C0;">Welcome to ZeroNetPay, ${user.username}!</h2><p>Your wallet is linked to <strong>${user.vpa}</strong>.</p><p>You can now receive money, sync your wallet, and send payments securely.</p>${dashboardHtml}</div></body></html>`;
  }

  private buildUserDashboardUrl(phone: string): string | null {
    const baseUrl = process.env.PUBLIC_BASE_URL?.trim() || 'https://zeronetpay-bank.onrender.com';
    const secret = process.env.USER_DASHBOARD_SECRET || process.env.ADMIN_SECRET;
    if (!secret) return null;

    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const nonce = Math.random().toString(36).slice(2, 14);
    const payload = `${phone}|${expiresAt}|${nonce}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = `${expiresAt}.${nonce}.${signature}`;
    return `${baseUrl}/user/${encodeURIComponent(phone)}/dashboard?token=${encodeURIComponent(token)}`;
  }

  getTestAccountInfo(): { user: string; url?: string } | null {
    if (!this.isConfigured) return null;
    return {
      user: emailConfig.fromEmail || 'not-configured',
    };
  }
}

const emailService = EmailService.getInstance();
export default emailService;
