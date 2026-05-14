import { Router } from 'express';
import { supabase } from '../lib/supabase';
import logger from '../utils/logger';
import { toMoneyNumber } from '../utils/money';
import { ensureSupabaseSystemState, getSupabaseBankState, SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE } from '../lib/supabaseSystem';
import emailService from '../services/emailService';

const router = Router();

function parseAmount(raw: any): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePhone(raw: any): string | null {
  const input = raw?.toString()?.trim();
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function formatTx(tx: any) {
  return {
    id: tx.tx_id,
    from: tx.sender_id,
    to: tx.receiver_id,
    amount: toMoneyNumber(tx.amount),
    signature: tx.signature,
    status: tx.status,
    type: tx.type,
    description: tx.description,
    timestamp: tx.created_at,
    createdAt: tx.created_at,
  };
}

async function fetchWallet(phone: string) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data;
}

router.get('/overview', async (_req, res) => {
  try {
    await ensureSupabaseSystemState();
    const state = await getSupabaseBankState();
    const now = Date.now() - 2 * 60 * 1000;

    const { data: users, error: usersError } = await supabase
      .from('wallets')
      .select('*')
      .neq('phone', SYSTEM_ADMIN_PHONE)
      .neq('phone', SYSTEM_VAULT_PHONE);
    if (usersError) throw usersError;

    const { data: recent, error: recentError } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(12);
    if (recentError) throw recentError;

    const onlineUsers = (users || []).filter((user: any) => {
      const lastSeen = user.last_seen_at ? new Date(user.last_seen_at).getTime() : 0;
      return user.status === 'ONLINE' || lastSeen >= now;
    }).length;

    const totalUserBalance = (users || []).reduce(
      (sum: number, user: any) => sum + toMoneyNumber(user.balance),
      0,
    );

    return res.json({
      success: true,
      serverTime: Date.now(),
      metrics: {
        users: (users || []).length,
        onlineUsers,
        totalUserBalance,
        vaultBalance: toMoneyNumber(state.vault_balance),
        transactionCount: (recent || []).length,
      },
      recentTransactions: (recent || []).map(formatTx),
    });
  } catch (error: any) {
    logger.error(`[ADMIN][SUPABASE] overview failed: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    await ensureSupabaseSystemState();
    const q = (req.query.q?.toString() || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));

    let query = supabase
      .from('wallets')
      .select('*')
      .neq('phone', SYSTEM_ADMIN_PHONE)
      .neq('phone', SYSTEM_VAULT_PHONE)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`phone.ilike.%${q}%,email.ilike.%${q}%,display_name.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json({
      success: true,
      count: (data || []).length,
      users: (data || []).map((user: any) => ({
        phone: user.phone,
        email: user.email,
        displayName: user.display_name,
        publicKey: user.public_key,
        balance: toMoneyNumber(user.balance),
        trustScore: Number(user.trust_score ?? 100),
        status: user.status,
        lastSeenAt: user.last_seen_at,
        lastSyncAt: user.last_sync_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      })),
    });
  } catch (error: any) {
    logger.error(`[ADMIN][SUPABASE] users failed: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/users/:phone/transactions', async (req, res) => {
  try {
    const phone = parsePhone(req.params.phone);
    if (!phone) return res.status(400).json({ success: false, error: 'Invalid phone number' });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .or(`sender_id.eq.${phone},receiver_id.eq.${phone}`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.json({ success: true, phone, transactions: (data || []).map(formatTx) });
  } catch (error: any) {
    logger.error(`[ADMIN][SUPABASE] user transactions failed: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/users/:phone/delete', async (req, res) => {
  try {
    const phone = parsePhone(req.params.phone);
    if (!phone) return res.status(400).json({ success: false, error: 'Invalid phone number' });
    if ([SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE].includes(phone)) {
      return res.status(400).json({ success: false, error: 'System accounts cannot be deleted' });
    }

    await ensureSupabaseSystemState();
    const wallet = await fetchWallet(phone);
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const refundAmount = toMoneyNumber(wallet.balance);
    const state = await getSupabaseBankState();

    if (refundAmount > 0) {
      await supabase
        .from('bank_state')
        .update({
          vault_balance: toMoneyNumber(state.vault_balance) + refundAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
    }

    await supabase.from('otp_codes').delete().eq('email', wallet.email);
    await supabase.from('users').delete().eq('wallet_id', wallet.wallet_id);
    const { error } = await supabase.from('wallets').delete().eq('wallet_id', wallet.wallet_id);
    if (error) throw error;

    return res.json({
      success: true,
      phone,
      email: wallet.email,
      refundedBalance: refundAmount,
      message: 'Account deleted successfully',
    });
  } catch (error: any) {
    logger.error(`[ADMIN][SUPABASE] delete user failed: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/add-money', async (req, res) => {
  try {
    const phone = parsePhone(req.body?.phone);
    const amount = parseAmount(req.body?.amount);
    if (!phone || amount == null) {
      return res.status(400).json({ success: false, error: 'Invalid phone or amount' });
    }

    await ensureSupabaseSystemState();
    const wallet = await fetchWallet(phone);
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const state = await getSupabaseBankState();
    if (toMoneyNumber(state.vault_balance) < amount) {
      return res.status(400).json({ success: false, error: 'Bank vault has insufficient balance' });
    }

    const newBalance = toMoneyNumber(wallet.balance) + amount;
    const newVaultBalance = toMoneyNumber(state.vault_balance) - amount;
    const now = new Date().toISOString();
    const txId = `admin_deposit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await supabase.from('wallets').update({
      balance: newBalance,
      status: 'ONLINE',
      last_seen_at: now,
      updated_at: now,
    }).eq('wallet_id', wallet.wallet_id);

    await supabase.from('bank_state').update({
      vault_balance: newVaultBalance,
      updated_at: now,
    }).eq('id', 1);

    await supabase.from('transactions').insert({
      tx_id: txId,
      sender_id: SYSTEM_VAULT_PHONE,
      receiver_id: wallet.wallet_id,
      amount,
      status: 'CONFIRMED',
      type: 'ADMIN_DEPOSIT',
      description: req.body?.note?.toString()?.trim() || 'Admin deposit',
      settled_at: now,
      created_at: now,
    });

    if (wallet.email) {
      void emailService.sendTransactionConfirmation(wallet.email, {
        id: txId,
        amount,
        recipient: wallet.phone,
        timestamp: new Date(),
        type: 'received',
      });
    }

    return res.json({
      success: true,
      phone,
      amount,
      balance: newBalance,
      vaultBalance: newVaultBalance,
    });
  } catch (error: any) {
    logger.error(`[ADMIN][SUPABASE] add money failed: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/remove-money', async (req, res) => {
  try {
    const phone = parsePhone(req.body?.phone);
    const amount = parseAmount(req.body?.amount);
    if (!phone || amount == null) {
      return res.status(400).json({ success: false, error: 'Invalid phone or amount' });
    }

    await ensureSupabaseSystemState();
    const wallet = await fetchWallet(phone);
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (toMoneyNumber(wallet.balance) < amount) {
      return res.status(400).json({ success: false, error: 'User balance is insufficient' });
    }

    const state = await getSupabaseBankState();
    const newBalance = toMoneyNumber(wallet.balance) - amount;
    const newVaultBalance = toMoneyNumber(state.vault_balance) + amount;
    const now = new Date().toISOString();
    const txId = `admin_withdraw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await supabase.from('wallets').update({
      balance: newBalance,
      status: 'ONLINE',
      last_seen_at: now,
      updated_at: now,
    }).eq('wallet_id', wallet.wallet_id);

    await supabase.from('bank_state').update({
      vault_balance: newVaultBalance,
      updated_at: now,
    }).eq('id', 1);

    await supabase.from('transactions').insert({
      tx_id: txId,
      sender_id: wallet.wallet_id,
      receiver_id: SYSTEM_VAULT_PHONE,
      amount,
      status: 'CONFIRMED',
      type: 'ADMIN_WITHDRAW',
      description: req.body?.note?.toString()?.trim() || 'Admin withdrawal',
      settled_at: now,
      created_at: now,
    });

    if (wallet.email) {
      void emailService.sendTransactionConfirmation(wallet.email, {
        id: txId,
        amount,
        recipient: 'ZeroNetPay Bank',
        timestamp: new Date(),
        type: 'sent',
      });
    }

    return res.json({
      success: true,
      phone,
      amount,
      balance: newBalance,
      vaultBalance: newVaultBalance,
    });
  } catch (error: any) {
    logger.error(`[ADMIN][SUPABASE] remove money failed: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/server-info', async (_req, res) => {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'https://your-render-service.onrender.com';
  return res.json({
    success: true,
    publicBaseUrl,
    bankUrl: publicBaseUrl,
    fullUrl: publicBaseUrl,
    isSupabaseMode: true,
  });
});

export default router;
