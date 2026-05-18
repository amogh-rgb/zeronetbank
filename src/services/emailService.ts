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
      const hasRelay = !!process.env.GMAIL_RELAY_URL?.trim();
      const hasSmtp = !!(emailConfig.user && emailConfig.pass);

      if (!hasSmtp && !hasRelay) {
        logger.warn('Email service disabled: Neither SMTP nor GMAIL_RELAY_URL configured');
        this.isConfigured = false;
        return;
      }

      if (hasRelay) {
        this.isConfigured = true;
        logger.info('Email service initialized with HTTP Gmail Relay');
      }

      if (hasSmtp) {
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
        logger.info(`Email service initialized with SMTP fallback (${emailConfig.service})`);
        await this.verifyTransporters();
      }
    } catch (error) {
      logger.error('Failed to initialize email service SMTP:', error as any);
      this.isConfigured = !!process.env.GMAIL_RELAY_URL?.trim();
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
      hasHttpRelay: !!process.env.GMAIL_RELAY_URL?.trim(),
    };
  }

  private createTransporter(options: { host: string; port: number; secure: boolean; ignoreTLS?: boolean }): nodemailer.Transporter {
    if (emailConfig.host.includes('gmail.com')) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailConfig.user,
          pass: emailConfig.pass,
        },
        connectionTimeout: emailConfig.connectionTimeout,
        greetingTimeout: emailConfig.greetingTimeout,
        socketTimeout: emailConfig.socketTimeout,
      });
    }

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

  private async sendViaHttpRelay(
    mailOptions: nodemailer.SendMailOptions,
    logContext: string
  ): Promise<boolean> {
    const relayUrl = process.env.GMAIL_RELAY_URL?.trim();
    if (!relayUrl) return false;

    try {
      logger.info(`[EMAIL] Sending ${logContext} via HTTP Gmail Relay...`);
      const response = await (global as any).fetch(relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: mailOptions.to,
          subject: mailOptions.subject,
          htmlBody: mailOptions.html,
          textBody: mailOptions.text,
        }),
      });

      if (!response.ok) {
        logger.error(`[EMAIL] HTTP Gmail Relay returned error status: ${response.status}`);
        return false;
      }

      const resData: any = await response.json();
      if (resData && resData.success === true) {
        logger.info(`[EMAIL] HTTP Gmail Relay sent successfully for ${logContext}`);
        return true;
      }

      logger.error(`[EMAIL] HTTP Gmail Relay returned success=false: ${JSON.stringify(resData)}`);
      return false;
    } catch (error: any) {
      logger.error(`[EMAIL] HTTP Gmail Relay request failed: ${error.message}`);
      return false;
    }
  }

  private async sendMailWithFallback(
    mailOptions: nodemailer.SendMailOptions,
    logContext: string,
  ): Promise<boolean> {
    // 1. Try Google HTTP Relay first if configured
    if (process.env.GMAIL_RELAY_URL?.trim()) {
      const ok = await this.sendViaHttpRelay(mailOptions, logContext);
      if (ok) return true;
    }

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
        console.log('OTP email send success:', result);
      } else {
        console.error('OTP email send failed');
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
      text: `ZeroNetPay Transaction confirmation: ₹${transactionDetails.amount.toFixed(2)} was ${transactionDetails.type} to ${transactionDetails.recipient}. ID: ${transactionDetails.id}`,
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
      text: `We detected a new login on your ZeroNetPay account from ${loginDetails.device} (IP: ${loginDetails.ip || 'Unknown'}) on ${loginDetails.timestamp.toLocaleString()}.`,
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
      text: `Welcome back, ${payload.username}! Your wallet phone ${payload.phone} is ready.`,
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
      text: `Reset code for your ZeroNetPay PIN is: ${resetToken}. Valid for 10 minutes.`,
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

  private getBaseHTMLWrapper(title: string, bodyContent: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      background-color: #f3f7fc;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    img {
      border: 0;
      outline: none;
      text-decoration: none;
      display: block;
    }
    a {
      text-decoration: none;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f7fc; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f7fc; padding: 40px 10px;">
    <tr>
      <td align="center" valign="top">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(15, 61, 145, 0.05); border: 1px solid #eef2f6;">
          <tr>
            <td align="center" valign="top" style="background: linear-gradient(135deg, #0f3d91 0%, #2f6bff 100%); padding: 40px 40px 35px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" valign="top">
                    <span style="font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">ZeroNetPay</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" valign="top" style="padding-top: 6px;">
                    <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.75); letter-spacing: 2px; text-transform: uppercase;">Realtime Offline Ledger</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="left" valign="top" style="padding: 40px 40px 30px 40px; background-color: #ffffff;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td align="center" valign="top" style="padding: 0 40px 35px 40px; background-color: #ffffff;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #f1f5f9; padding-top: 25px;">
                <tr>
                  <td align="center" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; color: #94a3b8; line-height: 1.6;">
                    This is an automated notification from the ZeroNetPay Secure Banking System. Please do not reply directly to this email.<br>
                    <span style="color: #64748b; font-weight: 500;">ZeroNetPay System Security Guard</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private getOTPHTML(otp: string, purpose: 'login' | 'register' | 'transaction' | 'reset'): string {
    const purposeText = {
      login: 'authenticate your secure login request',
      register: 'complete your email verification and account registration',
      transaction: 'authorize your net-pay transaction',
      reset: 'reset your secure wallet PIN',
    }[purpose];

    const bodyContent = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; color: #334155; line-height: 1.6;">
            Hello,
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; color: #334155; line-height: 1.6; padding-top: 10px;">
            We received a request to <strong>${purposeText}</strong>. Please use the following One-Time Password (OTP) to proceed:
          </td>
        </tr>
        <tr>
          <td align="center" valign="top" style="padding: 30px 0;">
            <table border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 16px; width: 100%; max-width: 320px;">
              <tr>
                <td align="center" valign="middle" style="padding: 20px; font-family: 'Outfit', monospace; font-size: 42px; font-weight: 700; color: #0f3d91; letter-spacing: 8px;">
                  ${otp}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #64748b; line-height: 1.6;">
            This OTP is active for <strong>10 minutes</strong> and can only be used once. If you did not make this request, you can safely ignore this security notification.
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="padding-top: 20px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fff1f2; border-radius: 12px; border: 1px solid #ffe4e6;">
              <tr>
                <td align="left" valign="top" style="padding: 12px 16px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; color: #e11d48; line-height: 1.5; font-weight: 500;">
                  ⚠️ SECURITY WARNING: Never share this OTP with anyone, including bank agents, customer care, or administrators. We will never call to ask for your verification codes.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
    return this.getBaseHTMLWrapper('ZeroNetPay Secure OTP', bodyContent);
  }

  private getTransactionHTML(transaction: { id: string; amount: number; recipient: string; timestamp: Date; type: 'sent' | 'received'; }): string {
    const isSent = transaction.type === 'sent';
    const accentColor = isSent ? '#e11d48' : '#10b981';
    const amountPrefix = isSent ? '-' : '+';
    const transactionTypeLabel = isSent ? 'Sent Successfully' : 'Received Successfully';
    
    const bodyContent = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" valign="top">
            <span style="display: inline-block; background-color: ${accentColor}15; color: ${accentColor}; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 6px 12px; border-radius: 100px;">
              Transaction ${isSent ? 'Sent' : 'Received'}
            </span>
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 700; color: #0f172a; padding-top: 15px;">
            Money ${transactionTypeLabel}
          </td>
        </tr>
        <tr>
          <td align="center" valign="top" style="padding: 30px 0;">
            <span style="font-family: 'Outfit', sans-serif; font-size: 48px; font-weight: 700; color: ${accentColor};">
              ${amountPrefix}₹${transaction.amount.toFixed(2)}
            </span>
          </td>
        </tr>
        <tr>
          <td align="left" valign="top">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9;">
              <tr>
                <td style="padding: 16px; border-bottom: 1px solid #f1f5f9;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #64748b; font-weight: 500;">Transaction ID</td>
                      <td align="right" style="font-family: 'Outfit', monospace; font-size: 14px; color: #0f172a; font-weight: 600;">${transaction.id}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px; border-bottom: 1px solid #f1f5f9;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #64748b; font-weight: 500;">${isSent ? 'Sent To' : 'Received From'}</td>
                      <td align="right" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #0f172a; font-weight: 600;">${transaction.recipient}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #64748b; font-weight: 500;">Timestamp</td>
                      <td align="right" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #0f172a; font-weight: 600;">${transaction.timestamp.toLocaleString()}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
    return this.getBaseHTMLWrapper('ZeroNetPay Transaction Alert', bodyContent);
  }

  private getLoginAlertHTML(loginDetails: { timestamp: Date; device: string; location?: string; ip?: string; }): string {
    const bodyContent = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" valign="top">
            <span style="display: inline-block; background-color: #f59e0b15; color: #d97706; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 6px 12px; border-radius: 100px;">
              Security Notice
            </span>
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 700; color: #0f172a; padding-top: 15px;">
            New Account Login Alert
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; color: #475569; line-height: 1.6; padding-top: 10px;">
            A login attempt was verified for your ZeroNetPay account. Below are the device session parameters details:
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="padding: 24px 0;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9;">
              <tr>
                <td style="padding: 14px 16px; border-bottom: 1px solid #f1f5f9;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #64748b; font-weight: 500;">Timestamp</td>
                      <td align="right" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #0f172a; font-weight: 600;">${loginDetails.timestamp.toLocaleString()}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 14px 16px; border-bottom: 1px solid #f1f5f9;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #64748b; font-weight: 500;">Device</td>
                      <td align="right" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #0f172a; font-weight: 600;">${loginDetails.device}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              ${loginDetails.location ? `
              <tr>
                <td style="padding: 14px 16px; border-bottom: 1px solid #f1f5f9;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #64748b; font-weight: 500;">Approx. Location</td>
                      <td align="right" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #0f172a; font-weight: 600;">${loginDetails.location}</td>
                    </tr>
                  </table>
                </td>
              </tr>` : ''}
              ${loginDetails.ip ? `
              <tr>
                <td style="padding: 14px 16px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #64748b; font-weight: 500;">IP Address</td>
                      <td align="right" style="font-family: 'Outfit', monospace; font-size: 14px; color: #0f172a; font-weight: 600;">${loginDetails.ip}</td>
                    </tr>
                  </table>
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; color: #b45309; line-height: 1.6; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 12px 16px;">
            🔔 If this active device login was you, no action is required. If this was not authorized by you, please open the ZeroNetPay application and rotate your wallet security PIN immediately.
          </td>
        </tr>
      </table>
    `;
    return this.getBaseHTMLWrapper('ZeroNetPay Login Alert', bodyContent);
  }

  private getPasswordResetHTML(resetToken: string): string {
    const bodyContent = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" valign="top">
            <span style="display: inline-block; background-color: #0f3d9115; color: #0f3d91; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 6px 12px; border-radius: 100px;">
              Account Support
            </span>
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 700; color: #0f172a; padding-top: 15px;">
            Reset Your Wallet PIN
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; color: #334155; line-height: 1.6; padding-top: 10px;">
            You requested a password/PIN reset. Please use the secure verification token shown below inside your ZeroNetPay application to setup a brand-new wallet access PIN:
          </td>
        </tr>
        <tr>
          <td align="center" valign="top" style="padding: 30px 0;">
            <table border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 16px; width: 100%; max-width: 320px;">
              <tr>
                <td align="center" valign="middle" style="padding: 20px; font-family: 'Outfit', monospace; font-size: 32px; font-weight: 700; color: #0f3d91; letter-spacing: 2px;">
                  ${resetToken}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; color: #64748b; line-height: 1.6;">
            This reset token is extremely sensitive and active for 10 minutes. If you did not initiate this request, please contact our administrative team.
          </td>
        </tr>
      </table>
    `;
    return this.getBaseHTMLWrapper('ZeroNetPay PIN Reset', bodyContent);
  }

  private getWelcomeHTML(user: { username: string; vpa: string; email: string }): string {
    const dashboardLink = this.buildUserDashboardUrl(user.vpa);
    const dashboardHtml = dashboardLink
      ? `
        <tr>
          <td align="center" valign="top" style="padding-top: 30px;">
            <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
              <tr>
                <td align="center" bgcolor="#0f3d91" style="border-radius: 12px;">
                  <a href="${dashboardLink}" target="_blank" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; display: inline-block; padding: 14px 28px; border-radius: 12px; border: 1px solid #0f3d91;">
                    Access Your Personal Dashboard
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
      : '';

    const bodyContent = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" valign="top" style="font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 700; color: #0f172a;">
            Welcome to ZeroNetPay, ${user.username}! 🎉
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; color: #475569; line-height: 1.6; padding-top: 15px;">
            We are absolutely thrilled to welcome you to ZeroNetPay. Your secure, smart offline wallet is fully activated and bound to your mobile identity:
          </td>
        </tr>
        <tr>
          <td align="center" valign="top" style="padding: 24px 0;">
            <table border="0" cellpadding="0" cellspacing="0" style="background-color: #f0f6ff; border: 1px solid #cbdff7; border-radius: 16px; padding: 16px 24px; text-align: center; width: 100%;">
              <tr>
                <td style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; color: #1e3a8a; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">Linked Payment VPA</td>
              </tr>
              <tr>
                <td style="font-family: 'Outfit', sans-serif; font-size: 22px; color: #0f3d91; font-weight: 700; padding-top: 6px;">${user.vpa}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; color: #475569; line-height: 1.6;">
            With ZeroNetPay, you can perform instant near-field BLE payments, receive money, sync with real-time state streams, and enjoy secure financial independence even when completely offline!
          </td>
        </tr>
        ${dashboardHtml}
      </table>
    `;
    return this.getBaseHTMLWrapper('Welcome to ZeroNetPay', bodyContent);
  }

  private getWelcomeBackHTML(payload: { username: string; phone: string; balance?: number }): string {
    const dashboardLink = this.buildUserDashboardUrl(payload.phone);
    const dashboardHtml = dashboardLink
      ? `
        <tr>
          <td align="center" valign="top" style="padding-top: 25px;">
            <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
              <tr>
                <td align="center" bgcolor="#0f3d91" style="border-radius: 12px;">
                  <a href="${dashboardLink}" target="_blank" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; display: inline-block; padding: 14px 28px; border-radius: 12px; border: 1px solid #0f3d91;">
                    Access Your Personal Dashboard
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
      : '';

    const balanceHtml = payload.balance != null
      ? `
        <tr>
          <td style="padding: 16px; border-top: 1px solid #e2e8f0; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #475569; font-weight: 500;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>Available Ledger Balance</td>
                <td align="right" style="font-family: 'Outfit', sans-serif; font-size: 16px; color: #10b981; font-weight: 700;">₹${payload.balance.toFixed(2)}</td>
              </tr>
            </table>
          </td>
        </tr>
      `
      : '';

    const bodyContent = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" valign="top" style="font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 700; color: #0f172a;">
            Welcome back, ${payload.username}! 👋
          </td>
        </tr>
        <tr>
          <td align="left" valign="top" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; color: #475569; line-height: 1.6; padding-top: 15px;">
            Your wallet session has been successfully restored. Your account is online and ready for transaction synchronization.
          </td>
        </tr>
        <tr>
          <td align="center" valign="top" style="padding: 24px 0;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
              <tr>
                <td style="padding: 16px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #475569; font-weight: 500;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>Linked Payment VPA</td>
                      <td align="right" style="font-family: 'Outfit', sans-serif; font-size: 14px; color: #0f172a; font-weight: 600;">${payload.phone}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              ${balanceHtml}
            </table>
          </td>
        </tr>
        ${dashboardHtml}
      </table>
    `;
    return this.getBaseHTMLWrapper('Welcome back to ZeroNetPay', bodyContent);
  }

  async testEmailConfiguration(): Promise<void> {
    await this.ensureReady();
    if (!this.isConfigured) return;
    try {
      const ok = await this.sendMailWithFallback({
        from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
        to: emailConfig.fromEmail,
        subject: 'ZeroNetPay - Email Service Test',
        text: 'This is a test email to verify the Gmail service is working correctly.',
        html: this.getTestEmailHTML(),
      }, 'SMTP self-test');
      if (ok) logger.info('Email service test successful');
      else logger.warn('Email service test failed');
    } catch (error) {
      logger.error('Email service test error:', error as any);
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
        text: `Welcome to ZeroNetPay, ${user.username}! Your secure wallet is fully ready and linked to ${user.vpa}.`,
        html: instance.getWelcomeHTML(user),
      }, `Welcome email to ${user.email}`);
      return { success: sent, message: sent ? 'Welcome email sent successfully' : 'Failed to send welcome email' };
    } catch {
      return { success: false, message: 'Failed to send welcome email' };
    }
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
