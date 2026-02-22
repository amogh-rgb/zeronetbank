/**
 * Auth Service
 *
 * Email + password + OTP + device binding.
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';

export class AuthService {
  private pool: Pool;
  private logger: any;

  constructor(pool: Pool, logger: any) {
    this.pool = pool;
    this.logger = logger;
  }

  async register(email: string, password: string): Promise<{ userId: string }>{
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);

    await this.pool.query(
      `INSERT INTO users (id, email, password_hash, status)
       VALUES ($1, $2, $3, 'active')`,
      [userId, email, passwordHash]
    );

    return { userId };
  }

  async login(email: string, password: string, deviceFingerprint: string, ip?: string, userAgent?: string): Promise<any> {
    const userResult = await this.pool.query(
      'SELECT id, password_hash, status FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = userResult.rows[0];
    if (user.status !== 'active') {
      throw new Error('Account not active');
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      throw new Error('Invalid credentials');
    }

    const deviceResult = await this.pool.query(
      'SELECT id, trusted FROM user_devices WHERE user_id = $1 AND device_fingerprint = $2',
      [user.id, deviceFingerprint]
    );

    if (deviceResult.rows.length === 0 || !deviceResult.rows[0].trusted) {
      await this.sendOtp(user.id, deviceFingerprint, 'device_verify');
      return { requiresOtp: true, userId: user.id };
    }

    const token = this.issueToken(user.id, email);
    const refreshToken = this.issueRefreshToken(user.id, email);
    await this.storeSession(user.id, refreshToken, deviceFingerprint);
    await this.pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    return { requiresOtp: false, token, refreshToken };
  }

  async sendOtp(userId: string, deviceFingerprint: string, purpose: string): Promise<void> {
    const recent = await this.pool.query(
      `SELECT COUNT(*) as count FROM otp_codes
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '10 minutes'`,
      [userId]
    );

    const count = parseInt(recent.rows[0]?.count || '0');
    if (count >= 3) {
      throw new Error('OTP rate limit exceeded');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const otpId = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    let deviceId: string | null = null;
    const deviceResult = await this.pool.query(
      'SELECT id FROM user_devices WHERE user_id = $1 AND device_fingerprint = $2',
      [userId, deviceFingerprint]
    );

    if (deviceResult.rows.length === 0) {
      const newDeviceId = uuidv4();
      await this.pool.query(
        `INSERT INTO user_devices (id, user_id, device_fingerprint, trusted, verified)
         VALUES ($1, $2, $3, false, false)`
        ,
        [newDeviceId, userId, deviceFingerprint]
      );
      deviceId = newDeviceId;
    } else {
      deviceId = deviceResult.rows[0].id;
    }

    await this.pool.query(
      `INSERT INTO otp_codes (id, user_id, device_id, code, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`
      ,
      [otpId, userId, deviceId, code, purpose, expiresAt]
    );

    await this.sendEmailOtp(userId, code);
  }

  async verifyOtp(userId: string, code: string, deviceFingerprint: string): Promise<{ token: string; refreshToken: string }> {
    const otpResult = await this.pool.query(
      `SELECT id, device_id, expires_at, verified, attempts, max_attempts
       FROM otp_codes
       WHERE user_id = $1 AND code = $2 AND verified = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, code]
    );

    if (otpResult.rows.length === 0) {
      throw new Error('Invalid OTP');
    }

    const otp = otpResult.rows[0];
    if (otp.attempts >= otp.max_attempts) {
      throw new Error('OTP attempts exceeded');
    }

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      throw new Error('OTP expired');
    }

    await this.pool.query(
      'UPDATE otp_codes SET verified = true, verified_at = NOW() WHERE id = $1',
      [otp.id]
    );

    await this.pool.query(
      `UPDATE user_devices SET trusted = true, verified = true, last_used = NOW()
       WHERE id = $1`,
      [otp.device_id]
    );

    const token = this.issueToken(userId, '');
    const refreshToken = this.issueRefreshToken(userId, '');
    await this.storeSession(userId, refreshToken, deviceFingerprint);
    return { token, refreshToken };
  }

  /**
   * Verify OTP for a specific purpose (e.g., admin_action)
   */
  async verifyOtpForPurpose(
    userId: string,
    code: string,
    deviceFingerprint: string,
    purpose: string
  ): Promise<void> {
    const otpResult = await this.pool.query(
      `SELECT id, device_id, expires_at, verified, attempts, max_attempts
       FROM otp_codes
       WHERE user_id = $1 AND code = $2 AND purpose = $3 AND verified = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, code, purpose]
    );

    if (otpResult.rows.length === 0) {
      throw new Error('Invalid OTP');
    }

    const otp = otpResult.rows[0];

    // Increment attempts for brute-force protection
    await this.pool.query(
      'UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1',
      [otp.id]
    );

    if (otp.attempts + 1 > otp.max_attempts) {
      throw new Error('OTP attempts exceeded');
    }

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      throw new Error('OTP expired');
    }

    await this.pool.query(
      'UPDATE otp_codes SET verified = true, verified_at = NOW() WHERE id = $1',
      [otp.id]
    );

    await this.pool.query(
      `UPDATE user_devices SET last_used = NOW(), trusted = true
       WHERE user_id = $1 AND device_fingerprint = $2`,
      [userId, deviceFingerprint]
    );
  }

  async requestPasswordReset(email: string, deviceFingerprint: string): Promise<void> {
    const userResult = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return;
    }

    await this.sendOtp(userResult.rows[0].id, deviceFingerprint, 'password_reset');
  }

  async resetPassword(userId: string, otp: string, newPassword: string): Promise<void> {
    const otpResult = await this.pool.query(
      `SELECT id, expires_at, verified
       FROM otp_codes
       WHERE user_id = $1 AND code = $2 AND purpose = 'password_reset'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, otp]
    );

    if (otpResult.rows.length === 0) {
      throw new Error('Invalid OTP');
    }

    if (new Date(otpResult.rows[0].expires_at).getTime() < Date.now()) {
      throw new Error('OTP expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );
  }

  private issueToken(userId: string, email: string): string {
    const secret = process.env.JWT_SECRET as string;
    const token = jwt.sign(
      { sub: userId, email },
      secret,
      { expiresIn: '1h' }
    );
    return token;
  }

  private issueRefreshToken(userId: string, email: string): string {
    const secret = process.env.REFRESH_TOKEN_SECRET as string;
    return jwt.sign({ sub: userId, email }, secret, { expiresIn: '30d' });
  }

  private async storeSession(userId: string, refreshToken: string, deviceFingerprint: string): Promise<void> {
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, device_fingerprint, expires_at)
       VALUES ($1, $2, $3, $4, $5)`
      ,
      [uuidv4(), userId, tokenHash, deviceFingerprint, expiresAt]
    );
  }

  private async sendEmailOtp(userId: string, code: string): Promise<void> {
    const emailResult = await this.pool.query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );

    const email = emailResult.rows[0]?.email;
    if (!email) {
      throw new Error('User email not found');
    }

    if (!process.env.SMTP_HOST) {
      this.logger.info(`OTP for ${email}: ${code}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@zeronettbank.local',
      to: email,
      subject: 'ZeroNetBank OTP Code',
      text: `Your OTP code is ${code}. It expires in 10 minutes.`,
    });
  }
}
