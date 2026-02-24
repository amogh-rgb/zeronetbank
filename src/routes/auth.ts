import express from 'express';
import { body } from 'express-validator';
import { AuthController } from '../controllers/AuthController';
import { handleValidationErrors } from '../server';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Input validation middleware
const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 1 }).withMessage('Password is required')
];

const validateRegister = [
  body('name').isLength({ min: 2, max: 50 }).trim().withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').optional().isIn(['user', 'admin']).withMessage('Role must be user or admin')
];

const validateChangePassword = [
  body('currentPassword').isLength({ min: 1 }).withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
];

// Public routes
router.post('/login', validateLogin, handleValidationErrors, AuthController.login);
router.post('/register', validateRegister, handleValidationErrors, AuthController.register);

// Protected routes
router.post('/verify', authenticateToken, AuthController.verifyToken);
router.post('/change-password', authenticateToken, validateChangePassword, handleValidationErrors, AuthController.changePassword);

export default router;
