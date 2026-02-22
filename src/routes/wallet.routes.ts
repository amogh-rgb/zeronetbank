import { Router } from 'express';
import { prisma } from '../services/db.service';
import { QueueAlertSchema, SyncSchema, TransferSchema } from '../utils/validation';
import { CryptoService } from '../services/crypto.service';
import logger from '../utils/logger';
import { ensureSystemState } from '../services/system.service';

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

  const user = await prisma.user.findUnique({ where: { phone: walletId } });
  if (!user) return { ok: false as const, status: 404, error: 'Wallet not found' };
  if (user.isFrozen) return { ok: false as const, status: 403, error: 'Wallet frozen' };

  const canonical = `${action}|${walletId}|${timestampRaw}`;
  const valid = CryptoService.verifySignature(canonical, signature, user.publicKey);
  if (!valid) return { ok: false as const, status: 401, error: 'Invalid request signature' };

  return {
    ok: true as const,
    user,
    walletId,
    timestampRaw,
    signature,
  };
}

// POST /wallet/ping
// Lightweight heartbeat for user-online visibility in admin.
router.post('/ping', async (req, res) => {
  try {
    await ensureSystemState();
    const phone =
      req.body?.phone?.toString().trim() ||
      (req.headers['x-wallet-id'] as string | undefined)?.trim();
    if (!phone) return res.status(400).json({ success: false, error: 'phone is required' });

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) return res.status(404).json({ success: false, error: 'Wallet not found' });

    const updated = await prisma.user.update({
      where: { phone },
      data: {
        status: 'ONLINE',
        lastSeenAt: new Date(),
        deviceInfo: req.body?.deviceInfo?.toString().slice(0, 240) || user.deviceInfo,
      },
    });

    return res.json({
      success: true,
      wallet: {
        phone: updated.phone,
        displayName: updated.displayName,
        balance: updated.balance,
        trustScore: updated.trustScore,
        status: updated.status,
        lastSeenAt: updated.lastSeenAt,
      },
    });
  } catch (e: any) {
    logger.error(`[PING] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /wallet/sync
router.post('/sync', async (req, res) => {
  try {
    await ensureSystemState();
    const auth = await authenticateWalletRequest(req, 'SYNC');
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

    const bodyResult = SyncSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid payload', details: bodyResult.error.errors });
    }

    const { offlineTransactions, deviceInfo } = bodyResult.data;
    const walletId = auth.walletId;
    const processedIds: string[] = [];
    const ignoredIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      const sender = await tx.user.findUnique({ where: { phone: walletId } });
      if (!sender) throw new Error('Wallet not found');

      for (const item of offlineTransactions) {
        const already = await tx.transaction.findUnique({ where: { id: item.id } });
        if (already) {
          processedIds.push(item.id);
          continue;
        }

        const rawFrom = item.from.trim();
        const rawTo = item.to.trim();
        const senderMatches =
          rawFrom === sender.publicKey || rawFrom === sender.phone || rawFrom === walletId;
        if (!senderMatches) {
          ignoredIds.push(item.id);
          continue;
        }

        const txCanonical = `${item.id}|${item.from}|${item.to}|${item.amount}|${item.timestamp}`;
        const txValid = CryptoService.verifySignature(txCanonical, item.signature, sender.publicKey);
        if (!txValid) {
          ignoredIds.push(item.id);
          continue;
        }

        const amount = Number(item.amount);
        if (amount <= 0 || !Number.isFinite(amount)) {
          ignoredIds.push(item.id);
          continue;
        }

        if (sender.balance < amount) {
          ignoredIds.push(item.id);
          continue;
        }

        const receiver =
          (await tx.user.findUnique({ where: { publicKey: rawTo } })) ||
          (await tx.user.findUnique({ where: { phone: rawTo } }));
        if (!receiver) {
          ignoredIds.push(item.id);
          continue;
        }

        await tx.user.update({
          where: { phone: sender.phone },
          data: { balance: { decrement: amount } },
        });

        if (receiver) {
          await tx.user.update({
            where: { phone: receiver.phone },
            data: { balance: { increment: amount } },
          });
        }

        await tx.transaction.create({
          data: {
            id: item.id,
            from: sender.phone,
            to: receiver.phone,
            amount,
            signature: item.signature,
            timestamp: BigInt(item.timestamp),
            status: 'CONFIRMED',
            type: item.type || 'TRANSFER',
            description: JSON.stringify({
              syncedAt: Date.now(),
              source: 'offline_queue',
              fromPublicKey: item.from,
              toPublicKey: item.to,
            }),
          },
        });

        processedIds.push(item.id);
      }

      await tx.user.update({
        where: { phone: walletId },
        data: {
          status: 'ONLINE',
          lastSeenAt: new Date(),
          lastSyncAt: new Date(),
          deviceInfo: deviceInfo || sender.deviceInfo,
        },
      });
    });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { phone: walletId } });
    const history = await prisma.transaction.findMany({
      where: {
        OR: [{ from: walletId }, { to: walletId }],
      },
      orderBy: { timestamp: 'desc' },
      take: 120,
    });

    const responseTimestamp = Date.now();
    const syncId = CryptoService.generateId();
    const trustScore = updatedUser.trustScore;
    const responseCanonical = `SYNC_V1|${syncId}|${walletId}|0|NORMAL|${trustScore}|${responseTimestamp}`;

    let responseSignature = '';
    const bankKey = process.env.BANK_PRIVATE_KEY_HEX || '';
    if (bankKey.length > 60) {
      try {
        responseSignature = CryptoService.sign(responseCanonical, bankKey);
      } catch (e: any) {
        logger.warn(`[SYNC] response signing failed: ${e.message}`);
      }
    }

    return res.json({
      success: true,
      bgw: true,
      balance: updatedUser.balance,
      trustScore,
      syncId,
      timestamp: responseTimestamp,
      containmentMode: 'NORMAL',
      responseSignature,
      processedIds,
      ignoredIds,
      transactions: history.map((row) => ({
        id: row.id,
        from: row.from,
        to: row.to,
        amount: row.amount,
        signature: row.signature,
        status: row.status,
        type: row.type,
        description: row.description,
        timestamp: row.timestamp.toString(),
        createdAt: row.createdAt,
      })),
      wallet: {
        phone: updatedUser.phone,
        displayName: updatedUser.displayName,
        status: updatedUser.status,
        lastSeenAt: updatedUser.lastSeenAt,
        lastSyncAt: updatedUser.lastSyncAt,
      },
      serverPublicKeyHex: process.env.BANK_PUBLIC_KEY_HEX,
    });
  } catch (e: any) {
    logger.error(`[SYNC] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /wallet/transfer
router.post('/transfer', async (req, res) => {
  try {
    await ensureSystemState();
    const auth = await authenticateWalletRequest(req, 'TRANSFER');
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

    const body = TransferSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, error: 'Invalid payload', details: body.error.errors });
    }

    const txData = body.data;
    const walletId = auth.walletId;
    await prisma.$transaction(async (tx) => {
      const sender = await tx.user.findUniqueOrThrow({ where: { phone: walletId } });
      if (sender.balance < txData.amount) throw new Error('Insufficient funds');

      const already = await tx.transaction.findUnique({ where: { id: txData.id } });
      if (already) return;

      const canonical = `${txData.id}|${txData.from}|${txData.to}|${txData.amount}|${txData.timestamp}`;
      const ok = CryptoService.verifySignature(canonical, txData.signature, sender.publicKey);
      if (!ok) throw new Error('Invalid transaction signature');

      const receiver =
        (await tx.user.findUnique({ where: { publicKey: txData.to } })) ||
        (await tx.user.findUnique({ where: { phone: txData.to } }));
      if (!receiver) throw new Error('Receiver wallet not found');

      await tx.user.update({
        where: { phone: sender.phone },
        data: { balance: { decrement: txData.amount } },
      });
      if (receiver) {
        await tx.user.update({
          where: { phone: receiver.phone },
          data: { balance: { increment: txData.amount } },
        });
      }

      await tx.transaction.create({
        data: {
          id: txData.id,
          from: sender.phone,
          to: receiver.phone,
          amount: txData.amount,
          signature: txData.signature,
          timestamp: BigInt(txData.timestamp),
          status: 'CONFIRMED',
          type: 'TRANSFER',
        },
      });
    });

    return res.json({ success: true, status: 'CONFIRMED', txId: txData.id });
  } catch (e: any) {
    logger.error(`[TRANSFER] ${e.message}`);
    return res.status(400).json({ success: false, error: e.message });
  }
});

// POST /wallet/queue-alert
router.post('/queue-alert', async (req, res) => {
  try {
    const auth = await authenticateWalletRequest(req, 'ALERT');
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

    const parsed = QueueAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid payload', details: parsed.error.errors });
    }

    const payload = parsed.data;
    const status = payload.severity === 'CRITICAL' ? 'NEEDS_REVIEW' : 'PENDING_REVIEW';

    await prisma.transaction.upsert({
      where: { id: payload.issueId },
      update: {
        status,
        description: JSON.stringify({
          walletId: auth.walletId,
          ...payload,
          reportedAt: Date.now(),
        }),
        timestamp: BigInt(Date.now()),
      },
      create: {
        id: payload.issueId,
        from: auth.walletId,
        to: 'BANK_ADMIN',
        amount: 0,
        signature: auth.signature,
        timestamp: BigInt(Date.now()),
        status,
        type: 'QUEUE_ALERT',
        description: JSON.stringify({
          walletId: auth.walletId,
          ...payload,
          reportedAt: Date.now(),
        }),
      },
    });

    return res.json({ success: true, issueId: payload.issueId, status });
  } catch (e: any) {
    logger.error(`[QUEUE_ALERT] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /wallet/queue-issues
router.get('/queue-issues', async (req, res) => {
  try {
    const auth = await authenticateWalletRequest(req, 'QUEUE_ISSUES');
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

    const includeResolved =
      req.query.includeResolved === '1' || req.query.includeResolved === 'true';

    const rows = await prisma.transaction.findMany({
      where: {
        type: 'QUEUE_ALERT',
        from: auth.walletId,
        ...(includeResolved ? {} : { status: { not: 'RESOLVED' } }),
      },
      orderBy: { timestamp: 'desc' },
      take: includeResolved ? 50 : 20,
    });

    return res.json({
      success: true,
      count: rows.length,
      issues: rows.map((row) => {
        let payload: Record<string, any> = {};
        try {
          payload = row.description ? JSON.parse(row.description) : {};
        } catch (_) {}
        return {
          id: row.id,
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
    logger.error(`[QUEUE_ISSUES] ${e.message}`);
    return res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
