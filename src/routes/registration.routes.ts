import { Router } from 'express';
import { UserRegistrationService } from '../services/user-registration.service';
import logger from '../utils/logger';

const router = Router();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { phone, email, displayName, registrationSource, deviceInfo } = req.body;

        if (!phone || !displayName) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and display name are required'
            });
        }

        const result = UserRegistrationService.registerUser({
            phone,
            email,
            displayName,
            registrationSource: registrationSource || 'web',
            deviceInfo
        });

        if (result.success) {
            res.status(201).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        logger.error('Error in user registration:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get user details
router.get('/user/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const user = UserRegistrationService.getUser(phone);

        if (user) {
            res.json({
                success: true,
                user
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
    } catch (error) {
        logger.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get all users (admin only)
router.get('/users', async (req, res) => {
    try {
        const users = UserRegistrationService.getAllUsers();
        res.json({
            success: true,
            users,
            count: users.length
        });
    } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get registration statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = UserRegistrationService.getRegistrationStats();
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        logger.error('Error fetching registration stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Update user status
router.patch('/user/:phone/status', async (req, res) => {
    try {
        const { phone } = req.params;
        const { status } = req.body;

        if (!['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be active, inactive, or suspended'
            });
        }

        const updated = UserRegistrationService.updateUserStatus(phone, status);

        if (updated) {
            res.json({
                success: true,
                message: `User status updated to ${status}`
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
    } catch (error) {
        logger.error('Error updating user status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

export default router;
