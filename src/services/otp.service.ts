import nodemailer from 'nodemailer';
import logger from '../utils/logger';
import crypto from 'crypto';

export class OTPService {
    private static otpStore: Map<string, { otp: string; expires: number; type: 'admin' | 'user' }> = new Map();
    private static emailTransporter: nodemailer.Transporter;

    static async initialize() {
        // Initialize email transporter
        this.emailTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.SMTP_USER || 'zeronetpay0@gmail.com',
                pass: process.env.SMTP_PASS || 'cxcx zmlz udoo vrzi'
            }
        });
    }

    static generateOTP(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    static async sendOTP(identifier: string, type: 'admin' | 'user'): Promise<{ success: boolean; message: string }> {
        try {
            const otp = this.generateOTP();
            const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

            // Store OTP
            this.otpStore.set(identifier, { otp, expires, type });

            // Send OTP via email
            const emailSent = await this.sendOTPEmail(identifier, otp, type);

            if (emailSent) {
                logger.info(`OTP sent to ${identifier} for ${type} access`);
                return { success: true, message: `OTP sent to ${identifier}` };
            } else {
                return { success: false, message: 'Failed to send OTP' };
            }
        } catch (error) {
            logger.error(`Error sending OTP to ${identifier}:`, error);
            return { success: false, message: 'Failed to send OTP' };
        }
    }

    private static async sendOTPEmail(identifier: string, otp: string, type: 'admin' | 'user'): Promise<boolean> {
        try {
            const subject = type === 'admin' ? 'ZeroNetBank Admin Access OTP' : 'ZeroNetBank Banking Access OTP';
            const html = this.generateOTPEmailTemplate(otp, type);

            const mailOptions = {
                from: process.env.SMTP_USER || 'zeronetpay0@gmail.com',
                to: identifier.includes('@') ? identifier : `${identifier}@example.com`, // For demo, append domain if phone
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

    private static generateOTPEmailTemplate(otp: string, type: 'admin' | 'user'): string {
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
                <title>ZeroNetBank OTP</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
                    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; }
                    .header img { width: 80px; height: 80px; border-radius: 16px; margin-bottom: 20px; }
                    .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 700; }
                    .content { padding: 40px; text-align: center; }
                    .otp-box { background: #f8fafc; border: 2px dashed #667eea; border-radius: 12px; padding: 30px; margin: 30px 0; }
                    .otp-code { font-size: 48px; font-weight: 700; color: #667eea; letter-spacing: 8px; margin: 10px 0; }
                    .footer { background: #f8fafc; padding: 30px; text-align: center; color: #666; font-size: 14px; }
                    .security-notice { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; text-align: left; }
                    .security-notice h4 { color: #92400e; margin: 0 0 10px 0; }
                    .security-notice p { color: #78350f; margin: 0; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <img src="${logoUrl}" alt="ZeroNetBank Logo">
                        <h1>ZeroNetBank</h1>
                    </div>
                    <div class="content">
                        <h2>${title}</h2>
                        <p style="color: #666; font-size: 16px; margin: 20px 0;">${description}</p>
                        
                        <div class="otp-box">
                            <p style="color: #666; margin: 0 0 10px 0; font-weight: 600;">Your One-Time Password (OTP)</p>
                            <div class="otp-code">${otp}</div>
                            <p style="color: #999; margin: 10px 0 0 0; font-size: 14px;">Valid for 5 minutes</p>
                        </div>

                        <div class="security-notice">
                            <h4>🔒 Security Notice</h4>
                            <p>• Never share your OTP with anyone<br>
                               • ZeroNetBank staff will never ask for your OTP<br>
                               • This OTP will expire in 5 minutes<br>
                               • If you didn't request this OTP, please ignore this email</p>
                        </div>
                    </div>
                    <div class="footer">
                        <p>© 2024 ZeroNetBank. All rights reserved.</p>
                        <p style="margin: 10px 0 0 0; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
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
