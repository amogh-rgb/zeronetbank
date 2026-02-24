import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/User';
import { AdminLog } from '../models/AdminLog';

export class AuthController {

  // User/Admin Login
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.userId,
          walletId: user.walletId,
          role: user.role,
          email: user.email
        },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      // Log admin login
      if (user.role === 'admin') {
        const adminLog = new AdminLog({
          adminId: user.userId,
          actionType: 'view',
          targetWallet: user.walletId,
          description: 'Admin login',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
        await adminLog.save();
      }

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: {
            userId: user.userId,
            name: user.name,
            email: user.email,
            walletId: user.walletId,
            role: user.role,
            balance: user.balance
          }
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed'
      });
    }
  }

  // User Registration
  static async register(req: Request, res: Response) {
    try {
      const { name, email, password, role = 'user' } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, and password are required'
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { email: email.toLowerCase() },
          { name: name.trim() }
        ]
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email or name already exists'
        });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Generate unique IDs
      const userId = uuidv4();
      const walletId = `WLT_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // Create user
      const user = new User({
        userId,
        name: name.trim(),
        email: email.toLowerCase(),
        passwordHash,
        walletId,
        role: role === 'admin' ? 'admin' : 'user'
      });

      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.userId,
          walletId: user.walletId,
          role: user.role,
          email: user.email
        },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          token,
          user: {
            userId: user.userId,
            name: user.name,
            email: user.email,
            walletId: user.walletId,
            role: user.role,
            balance: user.balance
          }
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed'
      });
    }
  }

  // Verify token (for frontend to check if token is valid)
  static async verifyToken(req: Request, res: Response) {
    // This endpoint is protected by authenticateToken middleware
    // If we reach here, the token is valid
    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        user: req.user
      }
    });
  }

  // Change password
  static async changePassword(req: Request, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.userId;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 8 characters long'
        });
      }

      const user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      user.passwordHash = newPasswordHash;
      await user.save();

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to change password'
      });
    }
  }
}
