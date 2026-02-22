import { prisma } from './db.service';

export const SYSTEM_VAULT_PHONE = 'BANK_VAULT';
export const SYSTEM_ADMIN_PHONE = 'BANK_ADMIN';
const SYSTEM_PUBLIC_KEY_VAULT = '04' + '1'.repeat(128);
const SYSTEM_PUBLIC_KEY_ADMIN = '04' + '2'.repeat(128);

export async function ensureSystemState() {
  await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { phone: SYSTEM_VAULT_PHONE },
      update: {
        displayName: 'Bank Vault',
        status: 'ONLINE',
        trustScore: 100,
      },
      create: {
        phone: SYSTEM_VAULT_PHONE,
        displayName: 'Bank Vault',
        publicKey: SYSTEM_PUBLIC_KEY_VAULT,
        balance: 0,
        trustScore: 100,
        status: 'ONLINE',
      },
    });

    await tx.user.upsert({
      where: { phone: SYSTEM_ADMIN_PHONE },
      update: {
        displayName: 'Bank Admin',
        status: 'ONLINE',
        trustScore: 100,
      },
      create: {
        phone: SYSTEM_ADMIN_PHONE,
        displayName: 'Bank Admin',
        publicKey: SYSTEM_PUBLIC_KEY_ADMIN,
        balance: 0,
        trustScore: 100,
        status: 'ONLINE',
      },
    });

    await tx.bankState.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        vaultBalance: 1000000.0,
      },
    });
  });
}

export async function getBankState() {
  const state = await prisma.bankState.findUnique({ where: { id: 1 } });
  if (state) return state;
  await ensureSystemState();
  return prisma.bankState.findUniqueOrThrow({ where: { id: 1 } });
}
