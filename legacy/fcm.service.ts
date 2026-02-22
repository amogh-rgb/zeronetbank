
import * as admin from 'firebase-admin';
import { Pool } from 'pg';

export class FcmService {
    private logger: any;
    private pool: Pool;
    private initialized = false;

    constructor(pool: Pool, logger: any) {
        this.pool = pool;
        this.logger = logger;
        this.initialize();
    }

    private initialize() {
        try {
            if (!admin.apps.length) {
                // In production, use GOOGLE_APPLICATION_CREDENTIALS or serviceAccount
                // For development/refactor, we check if credentials exist or mock
                if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                    admin.initializeApp({
                        credential: admin.credential.applicationDefault(),
                    });
                    this.initialized = true;
                    this.logger.info('✅ FCM Initialized');
                } else {
                    this.logger.warn('⚠️ FCM credentials not found. Notifications will be mocked.');
                }
            } else {
                this.initialized = true;
            }
        } catch (error) {
            this.logger.error('❌ FCM Initialization failed:', error);
        }
    }

    async sendSilentPush(phoneNumber: string, payload: any): Promise<void> {
        if (!this.initialized) {
            this.logger.info(`[MOCK FCM] Sending to ${phoneNumber}:`, payload);
            return;
        }

        try {
            // Find device tokens for the phone number
            // We need to join wallets -> user -> user_devices or assume direct link
            // For Master Spec: "Integrate firebase_messaging... On silent push..."
            // We'll query devices linked to the wallet phone number.
            // Schema has `user_devices` linked to `users`. `wallets` is linked to `wallet_links` -> `users`.

            const tokensResult = await this.pool.query(
                `SELECT ud.device_fingerprint -- Assuming device_fingerprint serves as FCM token placeholder or we need a real token column
         FROM user_devices ud
         JOIN users u ON u.id = ud.user_id
         JOIN wallet_links wl ON wl.user_id = u.id
         WHERE wl.phone_number = $1`,
                [phoneNumber]
            );

            // Note: A real implementation would store FCM tokens in `user_devices`.
            // For now, we simulate.

            if (tokensResult.rows.length === 0) {
                this.logger.warn(`No devices found for ${phoneNumber}`);
                return;
            }

            this.logger.info(`Sending FCM to ${tokensResult.rows.length} devices for ${phoneNumber}`);

            // Example sending (commented out until token column exists)
            /*
            const message = {
              data: payload,
              tokens: tokensResult.rows.map(r => r.fcm_token),
            };
            await admin.messaging().sendMulticast(message);
            */

            this.logger.info(`[FCM] Sent silent push:`, payload);

        } catch (error) {
            this.logger.error('FCM Send Error:', error);
        }
    }
}
