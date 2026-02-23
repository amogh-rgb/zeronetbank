import { Router } from 'express';
import { UserProfileService } from '../services/user-profile.service';
import logger from '../utils/logger';

const router = Router();

// Link phone with email
router.post('/link', async (req, res) => {
    try {
        const { phone, email, name } = req.body;

        if (!phone || !email || !name) {
            return res.status(400).json({
                success: false,
                message: 'Phone, email, and name are required'
            });
        }

        const result = UserProfileService.linkPhoneWithEmail(phone, email, name);

        if (result.success) {
            res.status(201).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        logger.error('Error linking profile:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get profile by phone
router.get('/profile/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const profile = UserProfileService.getProfileByPhone(phone);

        if (profile) {
            res.json({
                success: true,
                profile
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Profile not found'
            });
        }
    } catch (error) {
        logger.error('Error fetching profile:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get all profiles
router.get('/profiles', async (req, res) => {
    try {
        const profiles = UserProfileService.getAllProfiles();
        res.json({
            success: true,
            profiles,
            count: profiles.length
        });
    } catch (error) {
        logger.error('Error fetching profiles:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

export default router;
