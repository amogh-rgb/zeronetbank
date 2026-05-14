import { Request, Response } from 'express';
import { OTPService } from '../services/otpService';
import { DatabaseService } from '../services/databaseService';
import { EmailService } from '../services/emailService';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface User {
  id: string;
  phone?: string;
  email?: string;
  vpa: string;
  username: string;
  walletId: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export class AuthController {
  /**
   * POST /auth/send-otp
   * Send OTP to user's phone or email
   */
  static async sendOTP(req: Request, res: Response): Promise<void> {
    try {
      const { identifier } = req.body; // phone or email

      if (!identifier) {
        res.status(400).json({
          success: false,
          message: 'Phone number or email is required'
        });
        return;
      }

      // Check if user already exists
      const existingUser = await this.getUserByIdentifier(identifier);
      if (existingUser) {
        res.status(409).json({
          success: false,
          message: 'User already exists. Please login instead.',
          userExists: true,
          loginMethod: existingUser.phone ? 'phone' : 'email'
        });
        return;
      }

      // Validate email format if email
      if (identifier.includes('@')) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(identifier)) {
          res.status(400).json({
            success: false,
            message: 'Invalid email format'
          });
          return;
        }
      }

      // Validate phone format if phone
      if (!identifier.includes('@')) {
        const phoneRegex = /^\+?[1-9]\d{10,14}$/;
        if (!phoneRegex.test(identifier.replace(/\s/g, ''))) {
          res.status(400).json({
            success: false,
            message: 'Invalid phone number format. Please include country code.'
          });
          return;
        }
      }

      // Send OTP
      const result = await OTPService.sendOTP(identifier);

      res.json({
        success: result.success,
        message: result.message,
        identifier: identifier,
        purpose: 'register'
      });

    } catch (error) {
      console.error('Send OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * POST /auth/verify-otp
   * Verify OTP and return success/failure
   */
  static async verifyOTP(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, otp, purpose } = req.body;

      if (!identifier || !otp) {
        res.status(400).json({
          success: false,
          message: 'Identifier and OTP are required'
        });
        return;
      }

      // Verify OTP
      const result = await OTPService.verifyOTPCode(identifier, otp);

      if (result.success) {
        // If OTP is valid, check if this is for login or reset
        if (purpose === 'login') {
          const existingUser = await this.getUserByIdentifier(identifier);
          if (existingUser) {
            const token = this.generateJWT(existingUser);
            
            res.json({
              success: true,
              message: 'Login successful',
              user: {
                id: existingUser.id,
                vpa: existingUser.vpa,
                username: existingUser.username,
                walletId: existingUser.walletId,
                balance: existingUser.balance,
                phone: existingUser.phone,
                email: existingUser.email
              },
              token
            });
            
            // Log login event
            await this.logAuditEvent(existingUser.id, 'LOGIN', 'User logged in successfully');
            return;
          }
        }
        
        if (purpose === 'reset') {
          res.json({
            success: true,
            message: 'OTP verified successfully. You can now reset your PIN.',
            nextStep: 'reset_pin'
          });
          return;
        }
      }

      res.json({
        success: result.success,
        message: result.message,
        attemptsRemaining: result.attemptsRemaining
      });

    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * POST /auth/register-or-login
   * Register new user or login existing user after OTP verification
   */
  static async registerOrLogin(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, isLogin } = req.body;

      if (!identifier) {
        res.status(400).json({
          success: false,
          message: 'Phone number or email is required'
        });
        return;
      }

      // Check if user exists
      const existingUser = await this.getUserByIdentifier(identifier);

      if (existingUser) {
        // Existing user - return login response
        const token = this.generateJWT(existingUser);
        
        res.json({
          success: true,
          message: 'Login successful',
          user: {
            id: existingUser.id,
            vpa: existingUser.vpa,
            username: existingUser.username,
            walletId: existingUser.walletId,
            balance: existingUser.balance,
            phone: existingUser.phone,
            email: existingUser.email
          },
          token,
          isNewUser: false
        });

        // Log login event
        await this.logAuditEvent(existingUser.id, 'LOGIN', 'User logged in successfully');

      } else {
        // New user - create account
        const newUser = await this.createUser(identifier);
        const token = this.generateJWT(newUser);

        // Send welcome email
        if (identifier.includes('@')) {
          await EmailService.sendWelcomeEmail({
            username: newUser.username,
            vpa: newUser.vpa,
            email: identifier
          });
        }

        res.json({
          success: true,
          message: 'Registration successful',
          user: {
            id: newUser.id,
            vpa: newUser.vpa,
            username: newUser.username,
            walletId: newUser.walletId,
            balance: newUser.balance,
            phone: newUser.phone,
            email: newUser.email
          },
          token,
          isNewUser: true
        });

        // Log registration event
        await this.logAuditEvent(newUser.id, 'REGISTRATION', 'New user registered');
      }

    } catch (error) {
      console.error('Register/Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * POST /auth/reset-pin
   * Reset user PIN after OTP verification
   */
  static async resetPIN(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, otp, newPin } = req.body;

      if (!identifier || !otp || !newPin) {
        res.status(400).json({
          success: false,
          message: 'Identifier, OTP, and new PIN are required'
        });
        return;
      }

      // Validate new PIN format
      if (!/^\d{4,6}$/.test(newPin)) {
        res.status(400).json({
          success: false,
          message: 'PIN must be 4-6 digits'
        });
        return;
      }

      // Verify OTP first
      const otpResult = await OTPService.verifyOTPCode(identifier, otp);
      
      if (!otpResult.success) {
        res.status(400).json({
          success: false,
          message: otpResult.message,
          attemptsRemaining: otpResult.attemptsRemaining
        });
        return;
      }

      // Update user PIN
      const updateResult = await this.updateUserPIN(identifier, newPin);
      
      if (updateResult.success) {
        res.json({
          success: true,
          message: 'PIN reset successful'
        });
        
        // Log PIN reset event
        await this.logAuditEvent(updateResult.userId, 'PIN_RESET', 'User PIN reset successfully');
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to reset PIN'
        });
      }

    } catch (error) {
      console.error('Reset PIN error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: existingUser.id,
        vpa: existingUser.vpa,
        username: existingUser.username,
        walletId: existingUser.walletId,
        balance: existingUser.balance,
        phone: existingUser.phone,
        email: existingUser.email
      },
      token,
      isNewUser: false
    });
      };
    }
    
    return null;
  }

  /**
   * Create new user
   */
  private static async createUser(identifier: string): Promise<User> {
    const userId = uuidv4();
    const walletId = uuidv4();
    const username = this.generateUsername(identifier);
    const vpa = `${username}@zeronet`;
    const now = new Date();

    const query = `
      INSERT INTO users (id, phone, email, vpa, username, wallet_id, balance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await DatabaseService.execute(query, [
      userId,
      identifier.includes('@') ? null : identifier,
      identifier.includes('@') ? identifier : null,
      vpa,
      username,
      walletId,
      0.0,
      now.toISOString(),
      now.toISOString()
    ]);

    return {
      id: userId,
      phone: identifier.includes('@') ? undefined : identifier,
      email: identifier.includes('@') ? identifier : undefined,
      vpa,
      username,
      walletId,
      balance: 0.0,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Generate username from identifier
   */
  private static generateUsername(identifier: string): string {
    if (identifier.includes('@')) {
      // For email, use the part before @ and add random suffix
      const emailPrefix = identifier.split('@')[0];
      const randomSuffix = Math.floor(Math.random() * 1000);
      return `${emailPrefix}${randomSuffix}`;
    } else {
      // For phone, use last 4 digits and add random suffix
      const last4 = identifier.slice(-4);
      const randomSuffix = Math.floor(Math.random() * 1000);
      return `user${last4}${randomSuffix}`;
    }
  }

  /**
   * Generate JWT token
   */
  private static generateJWT(user: User): string {
    const payload = {
      userId: user.id,
      vpa: user.vpa,
      walletId: user.walletId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    const signature = crypto
      .createHmac('sha256', 'zeronet-pay-secret-key')
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Log audit event
   */
  private static async logAuditEvent(
    userId: string,
    eventType: string,
    description: string
  ): Promise<void> {
    const query = `
      INSERT INTO audit_logs (id, user_id, event_type, description, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `;

    await DatabaseService.execute(query, [
      uuidv4(),
      userId,
      eventType,
      description,
      new Date().toISOString()
    ]);
  }
}
