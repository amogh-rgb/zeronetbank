import crypto from 'crypto';
import { DatabaseService } from './databaseService';
import { EmailService } from './emailService';

export interface OTPData {
  id: string;
  identifier: string; // phone or email
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export class OTPService {
  private static readonly OTP_LENGTH = 6;
  private static readonly OTP_EXPIRY_MINUTES = 5;
  private static readonly MAX_ATTEMPTS = 5;

  /**
   * Generate a 6-digit OTP
   */
  static generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Hash OTP for secure storage
   */
  static hashOTP(otp: string, identifier: string): string {
    const salt = crypto.createHash('sha256').update(identifier).digest('hex');
    return crypto.pbkdf2Sync(otp, salt, 100000, 64, 'sha512').toString('hex');
  }

  /**
   * Verify OTP against hash
   */
  static verifyOTP(otp: string, identifier: string, storedHash: string): boolean {
    const computedHash = this.hashOTP(otp, identifier);
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  }

  /**
   * Send OTP to user
   */
  static async sendOTP(identifier: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if OTP already exists and hasn't expired
      const existingOTP = await this.getActiveOTP(identifier);
      if (existingOTP) {
        const timeSinceLastOTP = Date.now() - existingOTP.createdAt.getTime();
        if (timeSinceLastOTP < 60000) { // 1 minute cooldown
          return { success: false, message: 'Please wait before requesting another OTP' };
        }
      }

      // Generate new OTP
      const otp = this.generateOTP();
      const otpHash = this.hashOTP(otp, identifier);
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      // Store OTP in database
      await this.storeOTP(identifier, otpHash, expiresAt);

      // Send OTP via email
      console.log(`Attempting to send OTP to ${identifier}: ${otp}`);
      const emailResult = await EmailService.sendOTP(identifier, otp, 'register');
      
      if (emailResult) {
        console.log(`✅ OTP sent successfully to ${identifier}: ${otp}`);
        return { success: true, message: 'OTP sent successfully' };
      } else {
        console.error(`❌ Failed to send OTP to ${identifier}`);
        return { success: false, message: 'Failed to send OTP' };
      }

    } catch (error) {
      console.error('Error sending OTP:', error);
      return { success: false, message: 'Internal server error' };
    }
  }

  /**
   * Verify OTP and return success/failure
   */
  static async verifyOTPCode(
    identifier: string,
    otp: string
  ): Promise<{ success: boolean; message: string; attemptsRemaining?: number }> {
    try {
      console.log(`Verifying OTP for ${identifier}: ${otp}`);
      const storedOTP = await this.getActiveOTP(identifier);
      
      if (!storedOTP) {
        console.log(`❌ No active OTP found for ${identifier}`);
        return { success: false, message: 'OTP not found or expired' };
      }

      // Check if expired
      if (Date.now() > storedOTP.expiresAt.getTime()) {
        await this.deleteOTP(identifier);
        return { success: false, message: 'OTP expired' };
      }

      // Check attempts
      if (storedOTP.attempts >= this.MAX_ATTEMPTS) {
        await this.deleteOTP(identifier);
        return { success: false, message: 'Maximum attempts exceeded' };
      }

      // Increment attempts
      await this.incrementAttempts(identifier);
      const attemptsRemaining = this.MAX_ATTEMPTS - (storedOTP.attempts + 1);

      // Verify OTP
      const isValid = this.verifyOTP(otp, identifier, storedOTP.otpHash);
      console.log(`OTP verification result for ${identifier}: ${isValid}`);
      
      if (isValid) {
        // Delete OTP after successful verification
        await this.deleteOTP(identifier);
        console.log(`✅ OTP verified successfully for ${identifier}`);
        return { success: true, message: 'OTP verified successfully' };
      } else {
        console.log(`❌ Invalid OTP for ${identifier}. Attempts remaining: ${attemptsRemaining}`);
        return { 
          success: false, 
          message: 'Invalid OTP',
          attemptsRemaining 
        };
      }

    } catch (error) {
      console.error('Error verifying OTP:', error);
      return { success: false, message: 'Internal server error' };
    }
  }

  /**
   * Store OTP in database
   */
  private static async storeOTP(
    identifier: string,
    otpHash: string,
    expiresAt: Date
  ): Promise<void> {
    const query = `
      INSERT INTO otps (identifier, otp_hash, expires_at, attempts, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(identifier) DO UPDATE SET
        otp_hash = excluded.otp_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        created_at = excluded.created_at
    `;

    await DatabaseService.execute(query, [
      identifier,
      otpHash,
      expiresAt.toISOString(),
      0,
      new Date().toISOString()
    ]);
  }

  /**
   * Get active OTP for identifier
   */
  private static async getActiveOTP(identifier: string): Promise<OTPData | null> {
    const query = `
      SELECT id, identifier, otp_hash as otpHash, expires_at as expiresAt, 
             attempts, created_at as createdAt
      FROM otps 
      WHERE identifier = ? AND expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await DatabaseService.get(query, [identifier]);
    
    if (result) {
      return {
        id: result.id,
        identifier: result.identifier,
        otpHash: result.otpHash,
        expiresAt: new Date(result.expiresAt),
        attempts: result.attempts,
        createdAt: new Date(result.createdAt)
      };
    }
    
    return null;
  }

  /**
   * Increment OTP attempts
   */
  private static async incrementAttempts(identifier: string): Promise<void> {
    const query = `
      UPDATE otps 
      SET attempts = attempts + 1 
      WHERE identifier = ?
    `;

    await DatabaseService.execute(query, [identifier]);
  }

  /**
   * Delete OTP for identifier
   */
  private static async deleteOTP(identifier: string): Promise<void> {
    const query = 'DELETE FROM otps WHERE identifier = ?';
    await DatabaseService.execute(query, [identifier]);
  }

  /**
   * Clean up expired OTPs (should be called periodically)
   */
  static async cleanupExpiredOTPs(): Promise<void> {
    const query = 'DELETE FROM otps WHERE expires_at <= datetime("now")';
    await DatabaseService.execute(query);
  }
}
