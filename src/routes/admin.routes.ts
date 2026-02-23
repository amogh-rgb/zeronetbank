import { Router } from 'express';
import { prisma } from '../services/db.service';
import logger from '../utils/logger';
import { ensureSystemState, getBankState, SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE } from '../services/system.service';

const router = Router();

function parseAmount(raw: any): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatTx(tx: any) {
  return {
    id: tx.id,
    from: tx.from,
    to: tx.to,
    amount: tx.amount,
    signature: tx.signature,
    status: tx.status,
    type: tx.type,
    description: tx.description,
    timestamp: tx.timestamp.toString(),
    createdAt: tx.createdAt,
  };
}

router.get('/overview', async (_req, res) => {
  try {
    await ensureSystemState();
    const state = await getBankState();
    const now = Date.now() - 2 * 60 * 1000;
    const onlineUsers = await prisma.user.count({
      where: {
        phone: { notIn: [SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE] },
        OR: [{ status: 'ONLINE' }, { lastSeenAt: { gte: new Date(now) } }],
      },
    });
    const users = await prisma.user.count({
      where: { phone: { notIn: [SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE] } },
    });
    const totalUserBalance = await prisma.user.aggregate({
      where: { phone: { notIn: [SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE] } },
      _sum: { balance: true },
    });
    const txCount = await prisma.transaction.count();
    const recent = await prisma.transaction.findMany({
      orderBy: { timestamp: 'desc' },
      take: 12,
    });

    return res.json({
      success: true,
      serverTime: Date.now(),
      metrics: {
        users,
        onlineUsers,
        totalUserBalance: totalUserBalance._sum.balance ?? 0,
        vaultBalance: state.vaultBalance,
        transactionCount: txCount,
      },
      recentTransactions: recent.map(formatTx),
    });
  } catch (e: any) {
    logger.error(`[ADMIN] /overview ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    await ensureSystemState();
    const q = (req.query.q?.toString() || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));

    const users = await prisma.user.findMany({
      where: {
        phone: { notIn: [SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE] },
        ...(q
          ? {
              OR: [
                { phone: { contains: q } },
                { displayName: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
      select: {
        phone: true,
        displayName: true,
        publicKey: true,
        balance: true,
        trustScore: true,
        status: true,
        lastSeenAt: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ success: true, count: users.length, users });
  } catch (e: any) {
    logger.error(`[ADMIN] /users ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/users/:phone/transactions', async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const txs = await prisma.transaction.findMany({
      where: { OR: [{ from: phone }, { to: phone }] },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return res.json({ success: true, phone, transactions: txs.map(formatTx) });
  } catch (e: any) {
    logger.error(`[ADMIN] /users/:phone/transactions ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/users/:phone/analytics', async (req, res) => {
  try {
    await ensureSystemState();
    const { phone } = req.params;
    const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));
    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        phone: true,
        displayName: true,
        publicKey: true,
        balance: true,
        trustScore: true,
        status: true,
        lastSeenAt: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const txs = await prisma.transaction.findMany({
      where: {
        OR: [{ from: phone }, { to: phone }],
        timestamp: { gte: BigInt(sinceMs) },
      },
      orderBy: { timestamp: 'asc' },
      take: 2000,
    });

    let incomingTotal = 0;
    let outgoingTotal = 0;
    let incomingCount = 0;
    let outgoingCount = 0;
    const typeCounts: Record<string, number> = {};
    const dailyMap = new Map<string, { incoming: number; outgoing: number; count: number }>();

    for (const tx of txs) {
      const ts = Number(tx.timestamp);
      const day = new Date(ts).toISOString().slice(0, 10);
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { incoming: 0, outgoing: 0, count: 0 });
      }
      const daily = dailyMap.get(day)!;
      daily.count += 1;

      const amount = Number(tx.amount) || 0;
      if (tx.to === phone) {
        incomingTotal += amount;
        incomingCount += 1;
        daily.incoming += amount;
      }
      if (tx.from === phone) {
        outgoingTotal += amount;
        outgoingCount += 1;
        daily.outgoing += amount;
      }

      const type = tx.type || 'UNKNOWN';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    const dailySeries = Array.from(dailyMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, v]) => ({
        day,
        incoming: v.incoming,
        outgoing: v.outgoing,
        count: v.count,
        net: v.incoming - v.outgoing,
      }));

    const byType = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    const recent = txs.slice(-100).reverse().map(formatTx);

    return res.json({
      success: true,
      user,
      periodDays: days,
      summary: {
        incomingTotal,
        outgoingTotal,
        netFlow: incomingTotal - outgoingTotal,
        incomingCount,
        outgoingCount,
        txCount: txs.length,
      },
      dailySeries,
      byType,
      recentTransactions: recent,
    });
  } catch (e: any) {
    logger.error(`[ADMIN] /users/:phone/analytics ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/add-money', async (req, res) => {
  const phone = req.body?.phone?.toString()?.trim();
  const amount = parseAmount(req.body?.amount);
  const note = req.body?.note?.toString()?.trim() || 'Admin deposit';
  if (!phone || amount == null) {
    return res.status(400).json({ success: false, error: 'Invalid phone or amount' });
  }

  try {
    await ensureSystemState();
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { phone } });
      if (!user) throw new Error('User not found');
      const state = await tx.bankState.findUniqueOrThrow({ where: { id: 1 } });
      if (state.vaultBalance < amount) throw new Error('Bank vault has insufficient balance');

      const updatedUser = await tx.user.update({
        where: { phone },
        data: {
          balance: { increment: amount },
          status: 'ONLINE',
          lastSeenAt: new Date(),
        },
      });

      const updatedState = await tx.bankState.update({
        where: { id: 1 },
        data: { vaultBalance: { decrement: amount } },
      });

      await tx.transaction.create({
        data: {
          id: `admin_deposit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          from: SYSTEM_VAULT_PHONE,
          to: phone,
          amount,
          signature: 'ADMIN_OPERATION',
          timestamp: BigInt(Date.now()),
          status: 'CONFIRMED',
          type: 'ADMIN_DEPOSIT',
          description: JSON.stringify({ note, operator: 'admin_panel' }),
        },
      });

      return { updatedUser, updatedState };
    });

    return res.json({
      success: true,
      phone,
      amount,
      balance: result.updatedUser.balance,
      vaultBalance: result.updatedState.vaultBalance,
    });
  } catch (e: any) {
    logger.error(`[ADMIN] add-money ${e.message}`);
    return res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/remove-money', async (req, res) => {
  const phone = req.body?.phone?.toString()?.trim();
  const amount = parseAmount(req.body?.amount);
  const note = req.body?.note?.toString()?.trim() || 'Admin withdrawal';
  if (!phone || amount == null) {
    return res.status(400).json({ success: false, error: 'Invalid phone or amount' });
  }

  try {
    await ensureSystemState();
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { phone } });
      if (!user) throw new Error('User not found');
      if (user.balance < amount) throw new Error('User balance is insufficient');

      const updatedUser = await tx.user.update({
        where: { phone },
        data: {
          balance: { decrement: amount },
          status: 'ONLINE',
          lastSeenAt: new Date(),
        },
      });

      const updatedState = await tx.bankState.update({
        where: { id: 1 },
        data: { vaultBalance: { increment: amount } },
      });

      await tx.transaction.create({
        data: {
          id: `admin_withdraw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          from: phone,
          to: SYSTEM_VAULT_PHONE,
          amount,
          signature: 'ADMIN_OPERATION',
          timestamp: BigInt(Date.now()),
          status: 'CONFIRMED',
          type: 'ADMIN_WITHDRAW',
          description: JSON.stringify({ note, operator: 'admin_panel' }),
        },
      });

      return { updatedUser, updatedState };
    });

    return res.json({
      success: true,
      phone,
      amount,
      balance: result.updatedUser.balance,
      vaultBalance: result.updatedState.vaultBalance,
    });
  } catch (e: any) {
    logger.error(`[ADMIN] remove-money ${e.message}`);
    return res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/queue-issues', async (_req, res) => {
  try {
    const rows = await prisma.transaction.findMany({
      where: { type: 'QUEUE_ALERT' },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });
    return res.json({
      success: true,
      issues: rows.map((row) => {
        let payload: Record<string, any> = {};
        try {
          payload = row.description ? JSON.parse(row.description) : {};
        } catch (_) {}
        return {
          id: row.id,
          walletId: payload.walletId ?? row.from,
          status: row.status,
          severity: payload.severity ?? 'WARN',
          warning: payload.warning ?? null,
          pendingCount: payload.pendingCount ?? 0,
          readyCount: payload.readyCount ?? 0,
          failingCount: payload.failingCount ?? 0,
          staleCount: payload.staleCount ?? 0,
          needsReviewCount: payload.needsReviewCount ?? 0,
          resolution: payload.resolution ?? null,
          resolutionNote: payload.resolutionNote ?? null,
          resolvedBy: payload.resolvedBy ?? null,
          resolvedAt: payload.resolvedAt ?? null,
          timestamp: row.timestamp.toString(),
        };
      }),
    });
  } catch (e: any) {
    logger.error(`[ADMIN] queue-issues ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/queue-issues/:id/resolve', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing || existing.type !== 'QUEUE_ALERT') {
      return res.status(404).json({ success: false, error: 'Queue issue not found' });
    }

    const resolutionNote = req.body?.resolutionNote?.toString().slice(0, 500) || null;
    const resolvedBy = req.body?.resolvedBy?.toString().slice(0, 120) || 'admin_panel';

    let payload: Record<string, any> = {};
    try {
      payload = existing.description ? JSON.parse(existing.description) : {};
    } catch (_) {}
    payload.resolution = 'resolved_by_admin';
    payload.resolutionNote = resolutionNote;
    payload.resolvedBy = resolvedBy;
    payload.resolvedAt = Date.now();

    await prisma.transaction.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        description: JSON.stringify(payload),
        timestamp: BigInt(Date.now()),
      },
    });
    return res.json({ success: true, id, status: 'RESOLVED' });
  } catch (e: any) {
    logger.error(`[ADMIN] resolve queue issue ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/queue-issues/:id/reopen', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing || existing.type !== 'QUEUE_ALERT') {
      return res.status(404).json({ success: false, error: 'Queue issue not found' });
    }

    const reopenReason = req.body?.reopenReason?.toString().slice(0, 500) || null;
    const reopenedBy = req.body?.reopenedBy?.toString().slice(0, 120) || 'admin_panel';

    let payload: Record<string, any> = {};
    try {
      payload = existing.description ? JSON.parse(existing.description) : {};
    } catch (_) {}
    payload.reopenReason = reopenReason;
    payload.reopenedBy = reopenedBy;
    payload.reopenedAt = Date.now();
    delete payload.resolution;
    delete payload.resolutionNote;
    delete payload.resolvedBy;
    delete payload.resolvedAt;

    await prisma.transaction.update({
      where: { id },
      data: {
        status: 'NEEDS_REVIEW',
        description: JSON.stringify(payload),
        timestamp: BigInt(Date.now()),
      },
    });

    return res.json({ success: true, id, status: 'NEEDS_REVIEW' });
  } catch (e: any) {
    logger.error(`[ADMIN] reopen queue issue ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Add wallets route for frontend compatibility
router.get('/wallets', async (req, res) => {
  try {
    await ensureSystemState();
    
    const wallets = await prisma.user.findMany({
      where: {
        phone: { notIn: [SYSTEM_ADMIN_PHONE, SYSTEM_VAULT_PHONE] },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        phone: true,
        balance: true,
        createdAt: true,
      },
    });

    return res.json(wallets);
  } catch (e: any) {
    logger.error(`[ADMIN] /wallets ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
