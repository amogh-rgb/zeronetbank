// Bank Payment API Service
// Handles secure communication with external bank payment API
// NEVER expose bank API keys to frontend

import axios, { AxiosInstance, AxiosError } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface PaymentRequest {
    amount: number;
    currency: string;
    customerPhone: string;
    description?: string;
    orderId: string;
}

interface PaymentResponse {
    success: boolean;
    transactionId?: string;
    status?: 'pending' | 'completed' | 'failed';
    message?: string;
    error?: string;
}

class BankApiService {
    private client: AxiosInstance;
    private readonly apiKey: string;
    private readonly apiUrl: string;
    private readonly timeout: number;

    constructor() {
        // Load from environment variables - NEVER hardcode
        this.apiKey = process.env.BANK_API_KEY || '';
        this.apiUrl = process.env.BANK_API_URL || '';
        this.timeout = parseInt(process.env.BANK_API_TIMEOUT || '30000');

        if (!this.apiKey || !this.apiUrl) {
            console.warn('[BankAPI] ⚠️  Bank API credentials not configured in .env file.');
            console.warn('[BankAPI] Payment routes will return errors until configured.');
            console.warn('[BankAPI] Add BANK_API_KEY and BANK_API_URL to .env file.');
            // Don't throw - allow server to start, but payment routes will fail gracefully
            // Note: If credentials are not configured, this.client will not be initialized,
            // leading to runtime errors if payment methods are called.
            // A more robust solution would be to make 'client' optional and check its existence
            // in payment methods, or initialize it to a dummy object.
            return;
        }

        // Create Axios instance with default config
        this.client = axios.create({
            baseURL: this.apiUrl,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'X-API-Version': '1.0',
            },
        });

        // Add request interceptor for logging
        this.client.interceptors.request.use(
            (config) => {
                console.log(`[BankAPI] Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                console.error('[BankAPI] Request error:', error.message);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => {
                console.log(`[BankAPI] Response: ${response.status} ${response.statusText}`);
                return response;
            },
            (error) => {
                console.error('[BankAPI] Response error:', error.message);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Initiate payment with external bank API
     * @param paymentData Payment request data
     * @returns Payment response
     */
    async initiatePayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
        // Check if credentials are configured
        if (!this.apiKey || !this.apiUrl) {
            console.error('[BankAPI] Cannot initiate payment - credentials not configured');
            return {
                success: false,
                status: 'failed',
                error: 'Bank API not configured. Please contact administrator.',
            };
        }

        try {
            console.log('[BankAPI] Initiating payment:', {
                amount: paymentData.amount,
                currency: paymentData.currency,
                orderId: paymentData.orderId,
            });

            // Call external bank API
            const response = await this.client.post('/payments/initiate', {
                amount: paymentData.amount,
                currency: paymentData.currency,
                customer_phone: paymentData.customerPhone,
                description: paymentData.description || 'ZeroNetPay Transaction',
                order_id: paymentData.orderId,
                callback_url: `${process.env.BACKEND_URL}/api/payment/callback`,
            });

            // Transform bank API response to our format
            return {
                success: true,
                transactionId: response.data.transaction_id,
                status: response.data.status,
                message: response.data.message || 'Payment initiated successfully',
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * Check payment status
     * @param transactionId Transaction ID from bank
     * @returns Payment status
     */
    async checkPaymentStatus(transactionId: string): Promise<PaymentResponse> {
        // Check if credentials are configured
        if (!this.apiKey || !this.apiUrl) {
            console.error('[BankAPI] Cannot check status - credentials not configured');
            return {
                success: false,
                status: 'failed',
                error: 'Bank API not configured. Please contact administrator.',
            };
        }

        try {
            console.log('[BankAPI] Checking payment status:', transactionId);

            const response = await this.client.get(`/payments/${transactionId}/status`);

            return {
                success: true,
                transactionId: response.data.transaction_id,
                status: response.data.status,
                message: response.data.message,
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * Handle API errors
     * @param error Axios error
     * @returns Error response
     */
    private handleError(error: unknown): PaymentResponse {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;

            // Timeout error
            if (axiosError.code === 'ECONNABORTED') {
                console.error('[BankAPI] Request timeout');
                return {
                    success: false,
                    status: 'failed',
                    error: 'Payment request timed out. Please try again.',
                };
            }

            // Network error
            if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
                console.error('[BankAPI] Network error:', axiosError.code);
                return {
                    success: false,
                    status: 'failed',
                    error: 'Unable to connect to payment gateway. Please check your connection.',
                };
            }

            // API error response
            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data as any;

                console.error('[BankAPI] API error:', status, data);

                return {
                    success: false,
                    status: 'failed',
                    error: data.message || `Payment failed with status ${status}`,
                };
            }
        }

        // Unknown error
        console.error('[BankAPI] Unknown error:', error);
        return {
            success: false,
            status: 'failed',
            error: 'An unexpected error occurred. Please try again.',
        };
    }
}

// Export singleton instance
export const bankApiService = new BankApiService();
export type { PaymentRequest, PaymentResponse };
