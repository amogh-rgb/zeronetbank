import nodemailer from 'nodemailer';
import logger from '../utils/logger';
<<<<<<< HEAD
import { UserProfileService } from './user-profile.service';
=======
import crypto from 'crypto';
>>>>>>> 6b520136e9b5d97ad4e43bc8938a8a2b0033ef76

export class OTPService {
    private static otpStore: Map<string, { otp: string; expires: number; type: 'admin' | 'user' }> = new Map();
    private static emailTransporter: nodemailer.Transporter;

    static async initialize() {
<<<<<<< HEAD
        // Initialize email transporter with Gmail
        this.emailTransporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: 'zeronetpay0@gmail.com',
                pass: 'cxcx zmlz udoo vrzi'
            },
            tls: {
                rejectUnauthorized: false
=======
        // Initialize email transporter
        this.emailTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.SMTP_USER || 'zeronetpay0@gmail.com',
                pass: process.env.SMTP_PASS || 'cxcx zmlz udoo vrzi'
>>>>>>> 6b520136e9b5d97ad4e43bc8938a8a2b0033ef76
            }
        });
    }

    static generateOTP(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    static async sendOTP(identifier: string, type: 'admin' | 'user'): Promise<{ success: boolean; message: string }> {
        try {
            const otp = this.generateOTP();
<<<<<<< HEAD
            const expires = Date.now() + 5 * 60 * 1000;

            // For admin, use fixed email
            // For users, look up linked email by phone
            let targetEmail = 'zeronetpay0@gmail.com'; // Always send to our email
            let userInfo = identifier;

            if (type === 'user') {
                // Check if phone is linked to email
                const linkedEmail = UserProfileService.getEmailByPhone(identifier);
                if (linkedEmail) {
                    userInfo = `${identifier} (${linkedEmail})`;
                } else {
                    // Auto-create profile if not exists
                    const newEmail = `${identifier}@zeronetpay.users`;
                    UserProfileService.linkPhoneWithEmail(identifier, newEmail, `User ${identifier}`);
                    userInfo = `${identifier} (Auto-registered)`;
                }
            }
=======
            const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiry
>>>>>>> 6b520136e9b5d97ad4e43bc8938a8a2b0033ef76

            // Store OTP
            this.otpStore.set(identifier, { otp, expires, type });

<<<<<<< HEAD
            // Send OTP via email to centralized email
            const emailSent = await this.sendOTPEmail(targetEmail, otp, type, userInfo);

            if (emailSent) {
                logger.info(`OTP sent to ${identifier} (${type}) - OTP: ${otp}`);
                return { 
                    success: true, 
                    message: `OTP sent to zeronetpay0@gmail.com for ${identifier}` 
                };
=======
            // Send OTP via email
            const emailSent = await this.sendOTPEmail(identifier, otp, type);

            if (emailSent) {
                logger.info(`OTP sent to ${identifier} for ${type} access`);
                return { success: true, message: `OTP sent to ${identifier}` };
>>>>>>> 6b520136e9b5d97ad4e43bc8938a8a2b0033ef76
            } else {
                return { success: false, message: 'Failed to send OTP' };
            }
        } catch (error) {
            logger.error(`Error sending OTP to ${identifier}:`, error);
            return { success: false, message: 'Failed to send OTP' };
        }
    }

<<<<<<< HEAD
    private static async sendOTPEmail(targetEmail: string, otp: string, type: 'admin' | 'user', userInfo: string): Promise<boolean> {
        try {
            const subject = type === 'admin' ? '🔐 ZeroNetBank Admin Access OTP' : '🏦 ZeroNetBank Banking Access OTP';
            const html = this.generateOTPEmailTemplate(otp, type, userInfo);
=======
    private static async sendOTPEmail(identifier: string, otp: string, type: 'admin' | 'user'): Promise<boolean> {
        try {
            const subject = type === 'admin' ? '🔐 ZeroNetBank Admin Access OTP' : '🏦 ZeroNetBank Banking Access OTP';
            const html = this.generateOTPEmailTemplate(otp, type, identifier);
>>>>>>> 6b520136e9b5d97ad4e43bc8938a8a2b0033ef76

            // Always use centralized ZeroNetPay email for all OTPs
            const mailOptions = {
                from: process.env.SMTP_USER || 'zeronetpay0@gmail.com',
                to: process.env.SMTP_USER || 'zeronetpay0@gmail.com', // Send to our centralized email
                subject,
                html
            };

            const result = await this.emailTransporter.sendMail(mailOptions);
            return result.accepted.length > 0;
        } catch (error) {
            logger.error('Error sending OTP email:', error);
            return false;
        }
    }

    private static generateOTPEmailTemplate(otp: string, type: 'admin' | 'user', identifier: string): string {
        const logoUrl = 'https://zeronetbank.onrender.com/logo.png';
        const title = type === 'admin' ? 'Admin Dashboard Access' : 'Personal Banking Access';
        const description = type === 'admin' 
            ? 'Use this OTP to access the ZeroNetBank Admin Dashboard'
            : 'Use this OTP to access your ZeroNetBank Personal Banking Dashboard';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ZeroNetBank OTP - ${type === 'admin' ? 'Admin' : 'User'} Access</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; }
                    .header img { width: 80px; height: 80px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
                    .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 700; }
                    .header p { color: rgba(255,255,255,0.8); margin: 10px 0 0 0; font-size: 16px; }
                    .content { padding: 40px; text-align: center; }
                    .user-details { background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: left; }
                    .user-details h4 { color: #333; margin: 0 0 15px 0; font-size: 16px; }
                    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e1e5e9; }
                    .detail-row:last-child { border-bottom: none; }
                    .detail-label { color: #666; font-weight: 600; }
                    .detail-value { color: #333; }
                    .otp-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 30px; margin: 30px 0; box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3); }
                    .otp-box p { color: rgba(255,255,255,0.9); margin: 0 0 15px 0; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
                    .otp-code { font-size: 56px; font-weight: 700; color: white; letter-spacing: 12px; margin: 10px 0; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                    .otp-timer { color: rgba(255,255,255,0.8); font-size: 14px; margin: 15px 0 0 0; }
                    .access-links { background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; }
                    .access-links h4 { color: #333; margin: 0 0 15px 0; }
                    .access-btn { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 5px; transition: all 0.3s ease; }
                    .access-btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4); }
                    .footer { background: #f8fafc; padding: 30px; text-align: center; color: #666; font-size: 14px; }
                    .security-notice { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; text-align: left; border-radius: 8px; }
                    .security-notice h4 { color: #92400e; margin: 0 0 10px 0; }
                    .security-notice p { color: #78350f; margin: 0; font-size: 14px; line-height: 1.6; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <img src="${logoUrl}" alt="ZeroNetBank Logo">
                        <h1>ZeroNetBank</h1>
                        <p>Secure Banking Access</p>
                    </div>
                    <div class="content">
                        <h2 style="color: #333; margin: 0 0 10px 0;">${title}</h2>
                        <p style="color: #666; font-size: 16px; margin: 0;">A login attempt was detected</p>
                        
                        <div class="user-details">
                            <h4>📋 Access Details</h4>
                            <div class="detail-row">
                                <span class="detail-label">User ID:</span>
                                <span class="detail-value">${identifier}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Access Type:</span>
                                <span class="detail-value">${type === 'admin' ? 'Administrator' : 'Customer Banking'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Time:</span>
                                <span class="detail-value">${new Date().toLocaleString()}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">IP Address:</span>
                                <span class="detail-value">Dynamic IP</span>
                            </div>
                        </div>
                        
                        <div class="otp-box">
                            <p>🔐 Your One-Time Password (OTP)</p>
                            <div class="otp-code">${otp}</div>
                            <p class="otp-timer">⏰ Valid for 5 minutes only</p>
                        </div>

                        <div class="access-links">
                            <h4>🔗 Quick Access Links</h4>
                            <a href="https://zeronetbank.onrender.com/admin.html" class="access-btn">Admin Dashboard</a>
                            <a href="https://zeronetbank.onrender.com/banking.html" class="access-btn">User Banking</a>
                        </div>

                        <div class="security-notice">
                            <h4>�️ Security Notice</h4>
                            <p>• Never share your OTP with anyone<br>
                               • ZeroNetBank staff will never ask for your OTP<br>
                               • This OTP will expire in 5 minutes<br>
                               • If you didn't request this OTP, ignore this email<br>
                               • Always verify you're on zeronetbank.onrender.com</p>
                        </div>
                    </div>
                    <div class="footer">
                        <p style="margin: 0; font-weight: 600;">© 2024 ZeroNetBank. All rights reserved.</p>
                        <p style="margin: 10px 0 0 0; font-size: 12px;">This is an automated security message. Please do not reply.</p>
                        <p style="margin: 5px 0 0 0; font-size: 12px;">Sent to: zeronetpay0@gmail.com</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    static verifyOTP(identifier: string, otp: string, type: 'admin' | 'user'): { success: boolean; message: string } {
        const storedOTP = this.otpStore.get(identifier);

        if (!storedOTP) {
            return { success: false, message: 'OTP not found or expired' };
        }

        if (storedOTP.type !== type) {
            return { success: false, message: 'Invalid OTP type' };
        }

        if (Date.now() > storedOTP.expires) {
            this.otpStore.delete(identifier);
            return { success: false, message: 'OTP expired' };
        }

        if (storedOTP.otp !== otp) {
            return { success: false, message: 'Invalid OTP' };
        }

        // OTP is valid, remove it
        this.otpStore.delete(identifier);
        return { success: true, message: 'OTP verified successfully' };
    }

    static cleanupExpiredOTPs() {
        const now = Date.now();
        for (const [key, value] of this.otpStore.entries()) {
            if (now > value.expires) {
                this.otpStore.delete(key);
            }
        }
    }

    // For demo purposes - get current OTP (remove in production)
    static getCurrentOTP(identifier: string): string | null {
        const stored = this.otpStore.get(identifier);
        return stored && Date.now() < stored.expires ? stored.otp : null;
    }
}

// Auto-cleanup expired OTPs every 5 minutes
setInterval(() => {
    OTPService.cleanupExpiredOTPs();
}, 5 * 60 * 1000);
