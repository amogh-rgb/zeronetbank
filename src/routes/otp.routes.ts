import { Router } from 'express';
import { OTPService } from '../services/otp.service';
import logger from '../utils/logger';

const router = Router();

// Initialize OTP service
OTPService.initialize();

// Send OTP
router.post('/send', async (req, res) => {
    try {
        const { identifier, type } = req.body;

        if (!identifier || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Identifier and type are required' 
            });
        }

        if (!['admin', 'user'].includes(type)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Type must be admin or user' 
            });
        }

        const result = await OTPService.sendOTP(identifier, type);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        logger.error('Error sending OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Verify OTP
router.post('/verify', async (req, res) => {
    try {
        const { identifier, otp, type } = req.body;

        if (!identifier || !otp || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Identifier, OTP, and type are required' 
            });
        }

        const result = OTPService.verifyOTP(identifier, otp, type);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        logger.error('Error verifying OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Demo endpoint - get current OTP (remove in production)
router.get('/current/:identifier', (req, res) => {
    const { identifier } = req.params;
    const otp = OTPService.getCurrentOTP(identifier);
    
    if (otp) {
        res.json({ success: true, otp });
    } else {
        res.json({ success: false, message: 'No active OTP found' });
    }
});

export default router;
