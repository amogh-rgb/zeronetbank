import express, { Request, Response } from 'express';
import logger from '../utils/logger';

const router = express.Router();

// OTP Store (in-memory for testing)
const otpStore: Map<string, { otp: string; expires: number; type: 'admin' | 'user' }> = new Map();

// Generate OTP
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { identifier, type } = req.body;
    
    if (!identifier || !type) {
      return res.status(400).json({ 
        success: false, 
        message: 'Identifier and type are required' 
      });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000;
    
    otpStore.set(identifier, { otp, expires, type });
    
    logger.info(`OTP generated for ${identifier} (${type}): ${otp}`);
    
    return res.json({ 
      success: true, 
      message: `OTP sent to ${identifier}`,
      otp: otp // For testing only - remove in production
    });
  } catch (error) {
    logger.error('Error sending OTP:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to send OTP' 
    });
  }
});

// Verify OTP
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { identifier, otp } = req.body;
    
    if (!identifier || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Identifier and OTP are required' 
      });
    }
    
    const storedOTP = otpStore.get(identifier);
    
    if (!storedOTP) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP not found or expired' 
      });
    }
    
    if (Date.now() > storedOTP.expires) {
      otpStore.delete(identifier);
      return res.status(400).json({ 
        success: false, 
        message: 'OTP expired' 
      });
    }
    
    if (storedOTP.otp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }
    
    // OTP is valid - remove it
    otpStore.delete(identifier);
    
    logger.info(`OTP verified successfully for ${identifier} (${storedOTP.type})`);
    
    return res.json({ 
      success: true, 
      message: 'OTP verified successfully',
      type: storedOTP.type
    });
  } catch (error) {
    logger.error('Error verifying OTP:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Verification failed' 
    });
  }
});

// Get current OTP (for testing)
router.get('/current/:identifier', (req: Request, res: Response) => {
  const { identifier } = req.params;
  const storedOTP = otpStore.get(identifier);
  
  if (storedOTP) {
    return res.json({ 
      success: true, 
      otp: storedOTP.otp,
      expires: storedOTP.expires,
      type: storedOTP.type
    });
  } else {
    return res.json({ 
      success: false, 
      message: 'No active OTP found' 
    });
  }
});

export default router;
