import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import UserService from '../services/user.service';
import logger from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, mobile, otp } = req.body;

    if (!email || !password || !name || !mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: email, password, name, mobile, otp'
      });
    }

    // Verify OTP first
    // Note: OTP verification would be done here

    const result = await UserService.registerUser({
      email,
      password,
      name,
      mobile
    });

    if (result.success) {
      logger.info(`[API] User registered: ${email}`);
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('[API] Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// User login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const result = await UserService.loginUser(email, password);

    if (result.success) {
      logger.info(`[API] User logged in: ${email}`);
      return res.json(result);
    } else {
      return res.status(401).json(result);
    }
  } catch (error) {
    logger.error('[API] Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// Get user profile with transactions
router.get('/profile/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const result = await UserService.getUserByEmail(email);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(404).json(result);
    }
  } catch (error) {
    logger.error('[API] Profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// Get user transactions
router.get('/transactions/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const result = await UserService.getUserTransactions(email);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(404).json(result);
    }
  } catch (error) {
    logger.error('[API] Transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
});

// Forgot password - send OTP
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if user exists
    const userResult = await UserService.getUserByEmail(email);

    if (!userResult.success) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // OTP will be sent by the OTP service
    logger.info(`[API] Forgot password requested for: ${email}`);

    return res.json({
      success: true,
      message: 'If user exists, OTP will be sent to registered mobile'
    });
  } catch (error) {
    logger.error('[API] Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Request failed'
    });
  }
});

// Get user by phone number
router.get('/by-phone/:phone', async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { phone }
    });

    if (user) {
      logger.info(`[API] User found by phone: ${phone}`);
      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName,
          phone: user.phone,
          balance: user.balance
        }
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
  } catch (error) {
    logger.error('[API] Find by phone error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to find user'
    });
  }
});

export default router;
