import { Router } from 'express';
import { AuthController } from '../controllers/authController';

const router = Router();

/**
 * Authentication Routes
 */

// POST /auth/send-otp
// Send OTP to user's phone or email
router.post('/send-otp', AuthController.sendOTP);

// POST /auth/verify-otp
// Verify OTP and return success/failure
router.post('/verify-otp', AuthController.verifyOTP);

// POST /auth/register-or-login
// Register new user or login existing user after OTP verification
router.post('/register-or-login', AuthController.registerOrLogin);

export default router;
