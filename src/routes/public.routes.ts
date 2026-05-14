import { Router } from 'express';
import { prisma } from '../services/db.service';
import logger from '../utils/logger';
import { toMoneyNumber } from '../utils/money';
import { verifyUserDashboardToken } from '../utils/auth';

const router = Router();

/**
 * GET /api/public/directory
 * Returns a list of all registered users for the People directory.
 * This allows users to find each other for P2P transfers.
 */
router.get('/directory', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                phone: true,
                email: true,
                publicKey: true,
                displayName: true,
                status: true,
                lastSeenAt: true,
            },
            where: {
                isFrozen: false,
                phone: { notIn: ['BANK_VAULT', 'BANK_ADMIN'] }
            },
            orderBy: {
                phone: 'asc'
            }
        });

        logger.info(`[PUBLIC] Directory fetched: ${users.length} users`);
        res.json(users);
    } catch (e: any) {
        logger.error(`[PUBLIC] Directory error: ${e.message}`);
        res.status(500).json({ error: 'Failed to fetch directory' });
    }
});

router.get('/user/:phone/dashboard', async (req, res) => {
    const phone = req.params.phone?.trim();
    const token = req.query.token?.toString() || '';

    if (!phone || !verifyUserDashboardToken(phone, token)) {
        return res.status(401).send(`
          <!DOCTYPE html>
          <html>
          <head><title>ZeroNetPay Dashboard</title></head>
          <body style="font-family:Arial,sans-serif;background:#eef4ff;padding:24px;">
            <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;">
              <h2 style="color:#b91c1c;">Unauthorized dashboard link</h2>
              <p>Your dashboard link is invalid or expired. Please login again from ZeroNetPay to receive a fresh secure link.</p>
            </div>
          </body>
          </html>
        `);
    }

    try {
        const user = await prisma.user.findUnique({
            where: { phone },
            select: {
                phone: true,
                email: true,
                displayName: true,
                balance: true,
                trustScore: true,
                status: true,
                lastSeenAt: true,
                lastSyncAt: true,
            },
        });

        if (!user) {
            return res.status(404).send(`
              <!DOCTYPE html>
              <html>
              <head><title>ZeroNetPay Dashboard</title></head>
              <body style="font-family:Arial,sans-serif;background:#eef4ff;padding:24px;">
                <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;">
                  <h2 style="color:#b91c1c;">User not found</h2>
                </div>
              </body>
              </html>
            `);
        }

        const transactions = await prisma.transaction.findMany({
            where: {
                OR: [{ from: phone }, { to: phone }],
            },
            orderBy: { timestamp: 'desc' },
            take: 20,
        });

        const rows = transactions.map((tx) => `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${new Date(Number(tx.timestamp)).toLocaleString()}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${tx.from === phone ? 'Sent' : 'Received'}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${tx.from === phone ? tx.to : tx.from}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">Rs ${toMoneyNumber(tx.amount).toFixed(2)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${tx.status}</td>
          </tr>
        `).join('');

        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>ZeroNetPay Dashboard</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          </head>
          <body style="margin:0;font-family:Arial,sans-serif;background:#eef4ff;color:#0f172a;">
            <div style="max-width:960px;margin:0 auto;padding:24px;">
              <div style="background:#ffffff;border-radius:20px;box-shadow:0 12px 30px rgba(15,61,145,0.12);overflow:hidden;">
                <div style="background:linear-gradient(135deg,#0f3d91,#2f6bff);padding:28px;color:#fff;">
                  <h1 style="margin:0;font-size:30px;">ZeroNetPay Dashboard</h1>
                  <p style="margin:8px 0 0;opacity:.9;">Secure user banking view</p>
                </div>
                <div style="padding:24px;">
                  <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px;">
                    <div style="flex:1 1 220px;background:#f8fbff;border:1px solid #d8e7ff;border-radius:16px;padding:16px;">
                      <div style="font-size:12px;color:#64748b;">Name</div>
                      <div style="font-size:20px;font-weight:700;">${user.displayName || 'ZeroNetPay User'}</div>
                    </div>
                    <div style="flex:1 1 220px;background:#f8fbff;border:1px solid #d8e7ff;border-radius:16px;padding:16px;">
                      <div style="font-size:12px;color:#64748b;">Phone</div>
                      <div style="font-size:20px;font-weight:700;">${user.phone}</div>
                    </div>
                    <div style="flex:1 1 220px;background:#f8fbff;border:1px solid #d8e7ff;border-radius:16px;padding:16px;">
                      <div style="font-size:12px;color:#64748b;">Email</div>
                      <div style="font-size:20px;font-weight:700;">${user.email || 'Not linked'}</div>
                    </div>
                    <div style="flex:1 1 220px;background:#f8fbff;border:1px solid #d8e7ff;border-radius:16px;padding:16px;">
                      <div style="font-size:12px;color:#64748b;">Balance</div>
                      <div style="font-size:28px;font-weight:700;color:#1565c0;">Rs ${toMoneyNumber(user.balance).toFixed(2)}</div>
                    </div>
                  </div>

                  <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px;">
                    <div style="flex:1 1 220px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
                      <div style="font-size:12px;color:#64748b;">Trust Score</div>
                      <div style="font-size:22px;font-weight:700;">${user.trustScore}</div>
                    </div>
                    <div style="flex:1 1 220px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
                      <div style="font-size:12px;color:#64748b;">Status</div>
                      <div style="font-size:22px;font-weight:700;">${user.status}</div>
                    </div>
                    <div style="flex:1 1 220px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
                      <div style="font-size:12px;color:#64748b;">Last Seen</div>
                      <div style="font-size:18px;font-weight:700;">${user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : 'N/A'}</div>
                    </div>
                    <div style="flex:1 1 220px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
                      <div style="font-size:12px;color:#64748b;">Last Sync</div>
                      <div style="font-size:18px;font-weight:700;">${user.lastSyncAt ? new Date(user.lastSyncAt).toLocaleString() : 'N/A'}</div>
                    </div>
                  </div>

                  <h2 style="margin:0 0 16px;">Recent Transactions</h2>
                  <div style="overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                      <thead>
                        <tr style="background:#f8fbff;">
                          <th style="text-align:left;padding:12px;">Date</th>
                          <th style="text-align:left;padding:12px;">Type</th>
                          <th style="text-align:left;padding:12px;">Counterparty</th>
                          <th style="text-align:left;padding:12px;">Amount</th>
                          <th style="text-align:left;padding:12px;">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${rows || `<tr><td colspan="5" style="padding:16px;">No transactions yet.</td></tr>`}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </body>
          </html>
        `);
    } catch (e: any) {
        logger.error(`[PUBLIC] user dashboard error: ${e.message}`);
        res.status(500).send('Failed to render user dashboard');
    }
});

export default router;
