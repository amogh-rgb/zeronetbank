import logger from '../utils/logger';

export interface UserRegistration {
    phone: string;
    email?: string;
    displayName: string;
    createdAt: Date;
    lastLogin?: Date;
    status: 'active' | 'inactive' | 'suspended';
    registrationSource: 'app' | 'web' | 'admin';
    deviceInfo?: {
        platform?: string;
        version?: string;
        deviceId?: string;
    };
}

export class UserRegistrationService {
    private static users: Map<string, UserRegistration> = new Map();

    static registerUser(userData: Omit<UserRegistration, 'createdAt' | 'status'>): { success: boolean; message: string; user?: UserRegistration } {
        try {
            const existingUser = this.users.get(userData.phone);
            
            if (existingUser) {
                return { 
                    success: false, 
                    message: 'User already registered with this phone number' 
                };
            }

            const newUser: UserRegistration = {
                ...userData,
                createdAt: new Date(),
                status: 'active',
            };

            this.users.set(userData.phone, newUser);
            
            logger.info(`New user registered: ${userData.phone} from ${userData.registrationSource}`);
            
            return { 
                success: true, 
                message: 'User registered successfully',
                user: newUser 
            };
        } catch (error) {
            logger.error('Error registering user:', error);
            return { success: false, message: 'Registration failed' };
        }
    }

    static getUser(phone: string): UserRegistration | null {
        return this.users.get(phone) || null;
    }

    static getAllUsers(): UserRegistration[] {
        return Array.from(this.users.values());
    }

    static updateUserStatus(phone: string, status: 'active' | 'inactive' | 'suspended'): boolean {
        const user = this.users.get(phone);
        if (user) {
            user.status = status;
            logger.info(`User ${phone} status updated to ${status}`);
            return true;
        }
        return false;
    }

    static updateLastLogin(phone: string): boolean {
        const user = this.users.get(phone);
        if (user) {
            user.lastLogin = new Date();
            return true;
        }
        return false;
    }

    static getRegistrationStats(): {
        total: number;
        active: number;
        inactive: number;
        suspended: number;
        fromApp: number;
        fromWeb: number;
        fromAdmin: number;
    } {
        const users = this.getAllUsers();
        return {
            total: users.length,
            active: users.filter(u => u.status === 'active').length,
            inactive: users.filter(u => u.status === 'inactive').length,
            suspended: users.filter(u => u.status === 'suspended').length,
            fromApp: users.filter(u => u.registrationSource === 'app').length,
            fromWeb: users.filter(u => u.registrationSource === 'web').length,
            fromAdmin: users.filter(u => u.registrationSource === 'admin').length,
        };
    }
}

export default UserRegistrationService;
