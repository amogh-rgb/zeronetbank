import logger from '../utils/logger';

export interface UserProfile {
    phone: string;
    email: string;
    name: string;
    createdAt: Date;
    lastLogin?: Date;
    isVerified: boolean;
}

export class UserProfileService {
    private static profiles: Map<string, UserProfile> = new Map();

    // Link phone with email
    static linkPhoneWithEmail(phone: string, email: string, name: string): { success: boolean; message: string; profile?: UserProfile } {
        try {
            // Check if phone already linked
            const existingProfile = this.profiles.get(phone);
            
            if (existingProfile) {
                // Update email if changed
                if (existingProfile.email !== email) {
                    existingProfile.email = email;
                    existingProfile.name = name;
                    logger.info(`Updated email for phone ${phone} to ${email}`);
                }
                return {
                    success: true,
                    message: 'Profile updated successfully',
                    profile: existingProfile
                };
            }

            // Create new profile
            const newProfile: UserProfile = {
                phone,
                email,
                name,
                createdAt: new Date(),
                isVerified: true
            };

            this.profiles.set(phone, newProfile);
            logger.info(`New profile created: ${phone} linked to ${email}`);

            return {
                success: true,
                message: 'Profile created successfully',
                profile: newProfile
            };
        } catch (error) {
            logger.error('Error linking phone with email:', error);
            return { success: false, message: 'Failed to create profile' };
        }
    }

    // Get profile by phone
    static getProfileByPhone(phone: string): UserProfile | null {
        return this.profiles.get(phone) || null;
    }

    // Get profile by email
    static getProfileByEmail(email: string): UserProfile | null {
        for (const profile of this.profiles.values()) {
            if (profile.email === email) {
                return profile;
            }
        }
        return null;
    }

    // Update last login
    static updateLastLogin(phone: string): boolean {
        const profile = this.profiles.get(phone);
        if (profile) {
            profile.lastLogin = new Date();
            return true;
        }
        return false;
    }

    // Get all profiles
    static getAllProfiles(): UserProfile[] {
        return Array.from(this.profiles.values());
    }

    // Get email by phone (for OTP sending)
    static getEmailByPhone(phone: string): string | null {
        const profile = this.profiles.get(phone);
        return profile ? profile.email : null;
    }

    // For demo: Create sample profiles
    static initializeDemoData() {
        // Sample user for testing
        this.linkPhoneWithEmail('9480268832', 'amoghsram@gmail.com', 'Amogh SRam');
        this.linkPhoneWithEmail('1234567890', 'user@example.com', 'Test User');
        this.linkPhoneWithEmail('9876543210', 'demo@zeronetpay.com', 'Demo User');
        
        logger.info('Demo user profiles initialized');
    }
}

// Initialize demo data on startup
UserProfileService.initializeDemoData();

export default UserProfileService;
