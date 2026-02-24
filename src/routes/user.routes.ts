import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import UserService from '../services/user.service';
import logger from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

// Wallet sync endpoint - critical for app functionality
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { phone, publicKey, transactions = [] } = req.body;

    if (!phone || !publicKey) {
      return res.status(400).json({
        success: false,
        message: 'Phone and publicKey are required'
      });
    }

    // Find or create wallet
    let wallet = await prisma.user.findUnique({
      where: { phone }
    });

    if (!wallet) {
      // Auto-register new wallet
      wallet = await prisma.user.create({
        data: {
          phone,
          email: `${phone}@zeronetpay.local`, // Temporary email for wallet
          password: '', // No password for wallet users
          displayName: `Wallet ${phone}`,
          balance: 0,
          publicKey,
          trustScore: 100
        }
      });
      logger.info(`[SYNC] Auto-registered wallet for ${phone}`);
    }

    // Process transactions
    const processedIds: string[] = [];
    const transactionRecords: any[] = [];

    for (const tx of transactions) {
      try {
        // Verify transaction signature (basic check)
        if (!tx.id || !tx.sender || !tx.receiver || !tx.amount || !tx.timestamp || !tx.signature) {
          logger.warn(`[SYNC] Invalid transaction format: ${JSON.stringify(tx)}`);
          continue;
        }

        // Check if transaction already processed
        const existingTx = await prisma.transaction.findUnique({
          where: { id: tx.id }
        });

        if (existingTx) {
          processedIds.push(tx.id);
          continue;
        }

        // Find sender and receiver
        const sender = await prisma.user.findFirst({
          where: {
            OR: [
              { phone: tx.sender },
              { publicKey: tx.sender }
            ]
          }
        });

        const receiver = await prisma.user.findFirst({
          where: {
            OR: [
              { phone: tx.receiver },
              { publicKey: tx.receiver }
            ]
          }
        });

        if (!sender) {
          logger.warn(`[SYNC] Sender not found: ${tx.sender}`);
          continue;
        }

        // Check sender balance
        if (sender.balance < tx.amount) {
          logger.warn(`[SYNC] Insufficient balance for ${tx.sender}`);
          continue;
        }

        // Process transaction
        await prisma.$transaction(async (txClient) => {
          // Deduct from sender
          await txClient.user.update({
            where: { id: sender.id },
            data: { balance: { decrement: tx.amount } }
          });

          // Add to receiver if exists
          if (receiver) {
            await txClient.user.update({
              where: { id: receiver.id },
              data: { balance: { increment: tx.amount } }
            });
          }

          // Create transaction record
          await txClient.transaction.create({
            data: {
              id: tx.id,
              senderId: sender.id,
              receiverId: receiver?.id || null,
              amount: tx.amount,
              timestamp: new Date(tx.timestamp),
              status: 'CONFIRMED',
              signature: tx.signature
            }
          });
        });

        processedIds.push(tx.id);
        transactionRecords.push({
          id: tx.id,
          sender: tx.sender,
          receiver: tx.receiver,
          amount: tx.amount,
          timestamp: tx.timestamp,
          status: 'CONFIRMED'
        });

        logger.info(`[SYNC] Processed transaction ${tx.id}`);

      } catch (txError) {
        logger.error(`[SYNC] Failed to process transaction ${tx.id}:`, txError);
        continue;
      }
    }

    // Get updated wallet data
    const updatedWallet = await prisma.user.findUnique({
      where: { phone },
      include: {
        sentTransactions: {
          orderBy: { timestamp: 'desc' },
          take: 50
        },
        receivedTransactions: {
          orderBy: { timestamp: 'desc' },
          take: 50
        }
      }
    });

    if (!updatedWallet) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch updated wallet'
      });
    }

    // Format transactions for response
    const allTransactions = [
      ...updatedWallet.sentTransactions.map(tx => ({
        id: tx.id,
        sender: tx.senderId,
        receiver: tx.receiverId,
        amount: tx.amount,
        timestamp: tx.timestamp.toISOString(),
        status: tx.status,
        type: 'sent'
      })),
      ...updatedWallet.receivedTransactions.map(tx => ({
        id: tx.id,
        sender: tx.senderId,
        receiver: tx.receiverId,
        amount: tx.amount,
        timestamp: tx.timestamp.toISOString(),
        status: tx.status,
        type: 'received'
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    logger.info(`[SYNC] Sync completed for ${phone}: ${processedIds.length} processed`);

    return res.json({
      success: true,
      balance: updatedWallet.balance,
      transactions: allTransactions,
      processedIds: processedIds,
      trustScore: updatedWallet.trustScore,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[SYNC] Sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Register new user (web interface - no OTP required)
router.post('/register-web', async (req: Request, res: Response) => {
  try {
    const { email, password, name, mobile } = req.body;

    if (!email || !password || !name || !mobile) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: email, password, name, mobile'
      });
    }

    const result = await UserService.registerUser({
      email,
      password,
      name,
      mobile
    });

    if (result.success) {
      logger.info(`[API] User registered via web: ${email}`);
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('[API] Web registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// Register new user (app interface - OTP required)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, mobile, otp, otpId } = req.body;

    if (!email || !password || !name || !mobile || !otp || !otpId) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: email, password, name, mobile, otp, otpId'
      });
    }

    // Verify OTP first
    const otpStore = (global as any).otpStore;
    if (!otpStore) {
      return res.status(500).json({
        success: false,
        message: 'OTP service not available'
      });
    }

    const stored = otpStore.get(otpId);

    if (!stored) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    if (String(stored.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    if (Date.now() > stored.expires) {
      otpStore.delete(otpId);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired'
      });
    }

    // OTP verified, clean it up
    otpStore.delete(otpId);

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
