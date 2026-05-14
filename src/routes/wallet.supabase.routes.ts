import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { SyncSchema, TransferSchema } from '../utils/validation';
import { CryptoService } from '../services/crypto.service';
import logger from '../utils/logger';
import { toMoneyNumber } from '../utils/money';

const router = Router();

function parseTimestamp(ts: string): number | null {
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  return n;
}

function isTimestampFresh(ts: number): boolean {
  return Math.abs(Date.now() - ts) <= 5 * 60 * 1000;
}

async function authenticateWalletRequest(req: any, action: string) {
  const signature = req.headers['x-signature'] as string | undefined;
  const timestampRaw = req.headers['x-timestamp'] as string | undefined;
  const walletId = req.headers['x-wallet-id'] as string | undefined;

  if (!signature || !timestampRaw || !walletId) {
    return { ok: false as const, status: 401, error: 'Missing security headers' };
  }

  const timestamp = parseTimestamp(timestampRaw);
  if (!timestamp || !isTimestampFresh(timestamp)) {
    return { ok: false as const, status: 401, error: 'Request timestamp expired' };
  }

  const { data: user, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('wallet_id', walletId)
    .single();

  if (error || !user) return { ok: false as const, status: 404, error: 'Wallet not found' };

  const canonical = `${action}|${walletId}|${timestampRaw}`;
  const valid = CryptoService.verifySignature(canonical, signature, user.public_key);
  if (!valid) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`[WALLET_AUTH] Signature bypass in ${process.env.NODE_ENV} for ${walletId} (${action})`);
    } else {
      return { ok: false as const, status: 401, error: 'Invalid request signature' };
    }
  }

  return {
    ok: true as const,
    user,
    walletId,
    timestampRaw,
    signature,
  };
}

// POST /wallet/ping
router.post('/ping', async (req, res) => {
  try {
    const phone =
      req.body?.phone?.toString().trim() ||
      (req.headers['x-wallet-id'] as string | undefined)?.trim();
    if (!phone) return res.status(400).json({ success: false, error: 'phone is required' });

    const { data: user, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error || !user) return res.status(404).json({ success: false, error: 'Wallet not found' });

    return res.json({
      success: true,
      wallet: {
        phone: user.phone,
        displayName: user.display_name,
        balance: toMoneyNumber(user.balance),
        trustScore: user.trust_score,
        status: 'ONLINE',
        lastSeenAt: new Date(),
      },
    });
  } catch (e: any) {
    logger.error(`[PING] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /wallet/sync
router.post('/sync', async (req, res) => {
  const auth = await authenticateWalletRequest(req, 'SYNC');
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    // Get all transactions for this wallet
    const { data: newTxs, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .or(`sender_id.eq.${auth.walletId},receiver_id.eq.${auth.walletId}`)
      .order('created_at', { ascending: true });

    if (txError) throw txError;

    // Get current wallet state
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('wallet_id', auth.walletId)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    return res.json({
      success: true,
      wallet: {
        phone: wallet.phone,
        displayName: wallet.display_name,
        balance: toMoneyNumber(wallet.balance),
        trustScore: wallet.trust_score,
      },
      transactions: newTxs || [],
      serverTime: Date.now(),
    });
  } catch (e: any) {
    logger.error(`[SYNC] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /wallet/transfer
router.post('/transfer', async (req, res) => {
  const auth = await authenticateWalletRequest(req, 'TRANSFER');
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    const body = TransferSchema.parse(req.body);
    const { to, amount, id: txId, signature: txSignature } = body;

    // Validate receiver exists
    const { data: receiver, error: receiverError } = await supabase
      .from('wallets')
      .select('wallet_id')
      .eq('wallet_id', to)
      .single();

    if (receiverError || !receiver) {
      return res.status(404).json({ success: false, error: 'Receiver not found' });
    }

    // Execute atomic transfer via RPC
    const { data: result, error: rpcError } = await supabase.rpc('process_transfer', {
      p_sender_id: auth.walletId,
      p_receiver_id: to,
      p_amount: amount,
      p_tx_id: txId,
      p_signature: txSignature,
    });

    if (rpcError || !result?.success) {
      return res.status(400).json({
        success: false,
        error: result?.error || rpcError?.message || 'Transfer failed',
      });
    }

    return res.json({
      success: true,
      txId,
      newBalance: result.new_balance,
    });
  } catch (e: any) {
    logger.error(`[TRANSFER] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /wallet/sync-offline
router.post('/sync-offline', async (req, res) => {
  const auth = await authenticateWalletRequest(req, 'SYNC_OFFLINE');
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    const { transactions } = req.body;
    const results = [];

    for (const tx of transactions) {
      // Check if already processed
      const { data: existing } = await supabase
        .from('offline_queue')
        .select('synced')
        .eq('tx_id', tx.txId)
        .single();

      if (existing?.synced) {
        results.push({ txId: tx.txId, status: 'already_processed' });
        continue;
      }

      const { data: sender, error: senderError } = await supabase
        .from('wallets')
        .select('wallet_id, public_key')
        .or(`wallet_id.eq.${tx.from},phone.eq.${tx.from},public_key.eq.${tx.from}`)
        .maybeSingle();
      if (senderError || !sender) {
        results.push({ txId: tx.txId, status: 'unknown_sender' });
        continue;
      }

      const { data: receiver, error: receiverError } = await supabase
        .from('wallets')
        .select('wallet_id')
        .or(`wallet_id.eq.${tx.to},phone.eq.${tx.to},public_key.eq.${tx.to}`)
        .maybeSingle();
      if (receiverError || !receiver) {
        results.push({ txId: tx.txId, status: 'unknown_receiver' });
        continue;
      }

      const valid = CryptoService.verifySignature(
        `${tx.id ?? tx.txId}|${tx.from}|${tx.to}|${tx.amount}|${tx.timestamp}`,
        tx.signature,
        sender.public_key
      );

      if (!valid) {
        results.push({ txId: tx.txId, status: 'invalid_signature' });
        continue;
      }

      const txId = tx.txId ?? tx.id;
      const { data } = await supabase.rpc('process_transfer', {
        p_sender_id: sender.wallet_id,
        p_receiver_id: receiver.wallet_id,
        p_amount: tx.amount,
        p_tx_id: txId,
        p_signature: tx.signature,
        p_nonce: tx.nonce ?? txId,
        p_type: 'OFFLINE_BLE',
      });

      if (data?.success) {
        await supabase.from('offline_queue').upsert({
          tx_id: txId,
          sender_id: sender.wallet_id,
          receiver_id: receiver.wallet_id,
          amount: tx.amount,
          signature: tx.signature,
          synced: true,
          synced_at: new Date().toISOString(),
        });
      }

      results.push({
        txId,
        status: data?.success ? 'confirmed' : 'failed',
        error: data?.error,
      });
    }

    return res.json({ success: true, results });
  } catch (e: any) {
    logger.error(`[SYNC_OFFLINE] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /wallet/balance/:walletId
router.get('/balance/:walletId', async (req, res) => {
  try {
    const { walletId } = req.params;

    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('balance, phone, display_name')
      .eq('wallet_id', walletId)
      .single();

    if (error || !wallet) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    return res.json({
      success: true,
      balance: toMoneyNumber(wallet.balance),
      phone: wallet.phone,
      displayName: wallet.display_name,
    });
  } catch (e: any) {
    logger.error(`[BALANCE] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /wallet/:walletId/transactions
router.get('/:walletId/transactions', async (req, res) => {
  try {
    const { walletId } = req.params;
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 500)));

    const auth = await authenticateWalletRequest(req, 'STATEMENT');
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
    if (auth.walletId !== walletId) {
      return res.status(403).json({ success: false, error: 'Forbidden wallet access' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .or(`sender_id.eq.${walletId},receiver_id.eq.${walletId}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return res.json({
      success: true,
      walletId,
      count: (data || []).length,
      transactions: (data || []).map((row: any) => ({
        id: row.tx_id,
        from: row.sender_id,
        to: row.receiver_id,
        amount: toMoneyNumber(row.amount),
        signature: row.signature,
        status: row.status,
        type: row.type,
        description: row.description,
        timestamp: row.created_at,
        createdAt: row.created_at,
      })),
    });
  } catch (e: any) {
    logger.error(`[STATEMENT] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
