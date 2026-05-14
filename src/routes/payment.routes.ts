import { Router } from 'express';
import { prisma } from '../services/db.service';
import { ensureSystemState } from '../services/system.service';
import { toMoneyNumber } from '../utils/money';

const router = Router();

function toAmount(raw: unknown): number | null {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

router.post('/initiate', async (req, res) => {
  try {
    await ensureSystemState();

    const amount = toAmount(req.body?.amount);
    const customerPhone = req.body?.customerPhone?.toString().trim();
    const currency = req.body?.currency?.toString().trim() || 'INR';
    const description = req.body?.description?.toString().trim() || 'ZeroNetPay Transaction';

    if (!amount || !customerPhone) {
      return res.status(400).json({
        success: false,
        error: 'amount and customerPhone are required',
      });
    }

    const user = await prisma.user.findUnique({ where: { phone: customerPhone } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Customer wallet not found' });
    }

    const transactionId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const timestamp = Date.now();

    await prisma.transaction.create({
      data: {
        id: transactionId,
        from: customerPhone,
        to: customerPhone,
        fromUserId: user.id,
        toUserId: user.id,
        amount,
        signature: 'PAYMENT_API',
        timestamp: BigInt(timestamp),
        status: 'PENDING',
        type: 'PAYMENT_INIT',
        description: JSON.stringify({ currency, description }),
      },
    });

    return res.json({
      success: true,
      data: {
        transactionId,
        orderId: transactionId,
        status: 'PENDING',
        amount,
        currency,
        message: 'Payment initiated successfully',
      },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/status/:transactionId', async (req, res) => {
  try {
    const transactionId = req.params.transactionId?.trim();
    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'transactionId is required' });
    }

    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    return res.json({
      success: true,
      data: {
        transactionId: tx.id,
        status: tx.status,
        type: tx.type,
        amount: toMoneyNumber(tx.amount),
        timestamp: tx.timestamp.toString(),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
