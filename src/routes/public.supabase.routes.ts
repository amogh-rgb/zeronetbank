import { Router } from 'express';
import { supabase } from '../lib/supabase';
import logger from '../utils/logger';
import { toMoneyNumber } from '../utils/money';
import { verifyUserDashboardToken } from '../utils/auth';
import { ensureSupabaseSystemState, SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE } from '../lib/supabaseSystem';

const router = Router();

router.get('/directory', async (_req, res) => {
  try {
    await ensureSupabaseSystemState();
    const { data, error } = await supabase
      .from('wallets')
      .select('phone,email,public_key,display_name')
      .neq('phone', SYSTEM_ADMIN_PHONE)
      .neq('phone', SYSTEM_VAULT_PHONE)
      .order('phone', { ascending: true });

    if (error) throw error;

    return res.json(
      (data || []).map((row: any) => ({
        phone: row.phone,
        email: row.email,
        publicKey: row.public_key,
        displayName: row.display_name,
      })),
    );
  } catch (error: any) {
    logger.error(`[PUBLIC][SUPABASE] directory failed: ${error.message}`);
    return res.status(500).json({ error: 'Failed to fetch directory' });
  }
});

router.get('/user/:phone/dashboard', async (req, res) => {
  const phone = req.params.phone?.trim();
  const token = req.query.token?.toString() || '';

  if (!phone || !verifyUserDashboardToken(phone, token)) {
    return res.status(401).send('Unauthorized dashboard link');
  }

  try {
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('phone', phone)
      .single();

    if (walletError || !wallet) {
      return res.status(404).send('User not found');
    }

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .or(`sender_id.eq.${wallet.wallet_id},receiver_id.eq.${wallet.wallet_id}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (txError) throw txError;

    const rows = (transactions || [])
      .map((tx: any) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${new Date(tx.created_at).toLocaleString()}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${tx.sender_id === wallet.wallet_id ? 'Sent' : 'Received'}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${tx.sender_id === wallet.wallet_id ? tx.receiver_id : tx.sender_id}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">Rs ${toMoneyNumber(tx.amount).toFixed(2)}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${tx.status}</td>
        </tr>
      `)
      .join('');

    return res.send(`<!DOCTYPE html>
      <html>
      <head><title>ZeroNetPay Dashboard</title><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
      <body style="margin:0;font-family:Arial,sans-serif;background:#eef4ff;color:#0f172a;">
        <div style="max-width:960px;margin:0 auto;padding:24px;">
          <div style="background:#ffffff;border-radius:20px;box-shadow:0 12px 30px rgba(15,61,145,0.12);overflow:hidden;">
            <div style="background:linear-gradient(135deg,#0f3d91,#2f6bff);padding:28px;color:#fff;">
              <h1 style="margin:0;font-size:30px;">ZeroNetPay Dashboard</h1>
              <p style="margin:8px 0 0;opacity:.9;">Secure user banking view</p>
            </div>
            <div style="padding:24px;">
              <p><strong>Name:</strong> ${wallet.display_name || 'ZeroNetPay User'}</p>
              <p><strong>Phone:</strong> ${wallet.phone}</p>
              <p><strong>Email:</strong> ${wallet.email || 'Not linked'}</p>
              <p><strong>Balance:</strong> Rs ${toMoneyNumber(wallet.balance).toFixed(2)}</p>
              <p><strong>Status:</strong> ${wallet.status || 'ONLINE'}</p>
              <h2>Recent Transactions</h2>
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
                <tbody>${rows || '<tr><td colspan="5" style="padding:16px;">No transactions yet.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>
      </body>
      </html>`);
  } catch (error: any) {
    logger.error(`[PUBLIC][SUPABASE] user dashboard failed: ${error.message}`);
    return res.status(500).send('Failed to render user dashboard');
  }
});

export default router;
