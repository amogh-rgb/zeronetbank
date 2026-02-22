import { Router } from 'express';
import { prisma } from '../services/db.service';
import { RegisterSchema } from '../utils/validation';
import { authLimiter } from '../middleware/rateLimit.middleware';
import logger from '../utils/logger';
import { ensureSystemState } from '../services/system.service';

const router = Router();
router.use(authLimiter);

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    await ensureSystemState();

    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid input', details: result.error.errors });
    }

    const { phone, publicKey, displayName } = result.data;
    const now = new Date();
    const normalizedName = displayName?.trim() || null;

    const existingByPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingByPhone) {
      const updated = await prisma.user.update({
        where: { phone },
        data: {
          publicKey,
          displayName: normalizedName ?? existingByPhone.displayName,
          status: 'ONLINE',
          lastSeenAt: now,
        },
      });

      return res.json({
        success: true,
        status: existingByPhone.publicKey === publicKey ? 'EXISTING' : 'KEY_ROTATED',
        wallet: {
          phone: updated.phone,
          displayName: updated.displayName,
          balance: updated.balance,
          trustScore: updated.trustScore,
          status: updated.status,
          lastSeenAt: updated.lastSeenAt,
        },
      });
    }

    const existingByKey = await prisma.user.findUnique({ where: { publicKey } });
    if (existingByKey) {
      const updated = await prisma.user.update({
        where: { publicKey },
        data: {
          phone,
          displayName: normalizedName ?? existingByKey.displayName,
          status: 'ONLINE',
          lastSeenAt: now,
        },
      });

      return res.json({
        success: true,
        status: 'KEY_RELINKED',
        wallet: {
          phone: updated.phone,
          displayName: updated.displayName,
          balance: updated.balance,
          trustScore: updated.trustScore,
          status: updated.status,
          lastSeenAt: updated.lastSeenAt,
        },
      });
    }

    const created = await prisma.user.create({
      data: {
        phone,
        publicKey,
        displayName: normalizedName,
        balance: 0,
        trustScore: 100,
        status: 'ONLINE',
        lastSeenAt: now,
      },
    });

    logger.info(`[AUTH] Registered wallet ${phone}`);

    return res.json({
      success: true,
      status: 'CREATED',
      wallet: {
        phone: created.phone,
        displayName: created.displayName,
        balance: created.balance,
        trustScore: created.trustScore,
        status: created.status,
        lastSeenAt: created.lastSeenAt,
      },
    });
  } catch (error: any) {
    logger.error(`[AUTH] register failed: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

