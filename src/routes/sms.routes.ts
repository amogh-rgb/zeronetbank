import { Router } from 'express';
import logger from '../utils/logger';
import { OTPService } from '../services/otp.service';

const router = Router();

// Send OTP via SMS (Firebase Auth or Email fallback)
router.post('/send-sms', async (req, res) => {
    try {
        const { phone, type = 'user' } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Generate and store OTP
        const otp = OTPService.generateOTP();
        const expires = Date.now() + 5 * 60 * 1000;
        
        // Store OTP
        (OTPService as any).otpStore.set(phone, { 
            otp, 
            expires, 
            type: type as 'admin' | 'user' 
        });

        // Log OTP for demo (in production, use Firebase Auth)
        logger.info(`📱 SMS OTP for ${phone}: ${otp}`);
        
        // For production, integrate Firebase Auth here
        // Firebase Auth provides 10,000 FREE SMS/month
        
        res.json({
            success: true,
            message: 'OTP generated successfully',
            demo: true,
            note: 'For production: Integrate Firebase Auth for real SMS delivery (10,000 FREE/month)'
        });

    } catch (error) {
        logger.error('Error in SMS OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send SMS OTP'
        });
    }
});

// Get current OTP (for demo/testing)
router.get('/current-sms/:phone', (req, res) => {
    const { phone } = req.params;
    const otp = (OTPService as any).getCurrentOTP(phone);
    
    if (otp) {
        res.json({ 
            success: true, 
            otp,
            phone,
            message: 'Use this OTP to login'
        });
    } else {
        res.json({ 
            success: false, 
            message: 'No active OTP found for this number' 
        });
    }
});

export default router;
