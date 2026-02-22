/**
 * Admin API Integration Tests
 * 
 * Tests all admin endpoints:
 * - Deposit
 * - Withdrawal
 * - Balance queries
 * - Integrity checks
 * - Admin logs
 * - System stats
 */

import request from 'supertest';
import app from '../src/index';

describe('Admin API Integration Tests', () => {
    const adminId = 'test-admin-1';
    const userId = 'test-user-1';

    describe('POST /api/admin/deposit', () => {
        it('should deposit money to user account', async () => {
            const response = await request(app)
                .post('/api/admin/deposit')
                .send({
                    userId,
                    amount: 1000,
                    currency: 'INR',
                    adminId,
                    description: 'Test deposit',
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Deposited');
        });

        it('should reject deposit with missing fields', async () => {
            const response = await request(app)
                .post('/api/admin/deposit')
                .send({
                    userId,
                    // Missing amount and adminId
                })
                .expect(400);

            expect(response.body.error).toBeDefined();
        });

        it('should reject negative deposit amount', async () => {
            const response = await request(app)
                .post('/api/admin/deposit')
                .send({
                    userId,
                    amount: -100,
                    adminId,
                })
                .expect(500);

            expect(response.body.error).toContain('positive');
        });
    });

    describe('POST /api/admin/withdraw', () => {
        it('should withdraw money from user account', async () => {
            // First deposit some money
            await request(app)
                .post('/api/admin/deposit')
                .send({
                    userId,
                    amount: 1000,
                    adminId,
                });

            // Then withdraw
            const response = await request(app)
                .post('/api/admin/withdraw')
                .send({
                    userId,
                    amount: 500,
                    currency: 'INR',
                    adminId,
                    description: 'Test withdrawal',
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Withdrew');
        });

        it('should reject withdrawal exceeding balance', async () => {
            const response = await request(app)
                .post('/api/admin/withdraw')
                .send({
                    userId,
                    amount: 999999,
                    adminId,
                })
                .expect(500);

            expect(response.body.error).toContain('Insufficient');
        });
    });

    describe('GET /api/admin/reserve', () => {
        it('should get bank reserve balance', async () => {
            const response = await request(app)
                .get('/api/admin/reserve')
                .query({ currency: 'INR' })
                .expect(200);

            expect(response.body.currency).toBe('INR');
            expect(response.body.balance).toBeDefined();
            expect(typeof response.body.balance).toBe('number');
        });
    });

    describe('GET /api/admin/balance/:userId', () => {
        it('should get user balance', async () => {
            const response = await request(app)
                .get(`/api/admin/balance/${userId}`)
                .query({ currency: 'INR' })
                .expect(200);

            expect(response.body.userId).toBe(userId);
            expect(response.body.currency).toBe('INR');
            expect(response.body.balance).toBeDefined();
        });
    });

    describe('GET /api/admin/balances', () => {
        it('should get all user balances', async () => {
            const response = await request(app)
                .get('/api/admin/balances')
                .query({ currency: 'INR' })
                .expect(200);

            expect(response.body.currency).toBe('INR');
            expect(response.body.balances).toBeDefined();
            expect(typeof response.body.balances).toBe('object');
        });
    });

    describe('GET /api/admin/integrity', () => {
        it('should validate accounting integrity', async () => {
            const response = await request(app)
                .get('/api/admin/integrity')
                .query({ currency: 'INR' })
                .expect(200);

            expect(response.body.currency).toBe('INR');
            expect(response.body.valid).toBeDefined();
            expect(typeof response.body.valid).toBe('boolean');
            expect(response.body.message).toBeDefined();
        });
    });

    describe('GET /api/admin/logs', () => {
        it('should get admin action logs', async () => {
            const response = await request(app)
                .get('/api/admin/logs')
                .query({ adminId, limit: 10 })
                .expect(200);

            expect(response.body.logs).toBeDefined();
            expect(Array.isArray(response.body.logs)).toBe(true);
            expect(response.body.count).toBeDefined();
        });

        it('should limit log results', async () => {
            const response = await request(app)
                .get('/api/admin/logs')
                .query({ limit: 5 })
                .expect(200);

            expect(response.body.logs.length).toBeLessThanOrEqual(5);
        });
    });

    describe('GET /api/admin/stats', () => {
        it('should get system statistics', async () => {
            const response = await request(app)
                .get('/api/admin/stats')
                .query({ currency: 'INR' })
                .expect(200);

            expect(response.body.totalUsers).toBeDefined();
            expect(response.body.totalBalance).toBeDefined();
            expect(response.body.bankReserve).toBeDefined();
            expect(response.body.totalTransactions).toBeDefined();
            expect(response.body.integrityValid).toBeDefined();
        });
    });

    describe('Double-Entry Accounting', () => {
        it('should maintain accounting integrity after multiple operations', async () => {
            // Perform multiple deposits and withdrawals
            await request(app).post('/api/admin/deposit').send({
                userId: 'user-1',
                amount: 1000,
                adminId,
            });

            await request(app).post('/api/admin/deposit').send({
                userId: 'user-2',
                amount: 2000,
                adminId,
            });

            await request(app).post('/api/admin/withdraw').send({
                userId: 'user-1',
                amount: 500,
                adminId,
            });

            // Check integrity
            const response = await request(app)
                .get('/api/admin/integrity')
                .query({ currency: 'INR' })
                .expect(200);

            expect(response.body.valid).toBe(true);
        });
    });
});
