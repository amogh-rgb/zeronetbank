import { prisma } from './db.service';

export const SYSTEM_VAULT_PHONE = 'BANK_VAULT';
export const SYSTEM_ADMIN_PHONE = 'BANK_ADMIN';
// Use fixed, non-trivial reserved keys to avoid collisions with dev/mock keys.
const SYSTEM_PUBLIC_KEY_VAULT =
  '04b34397b23a39751422c836851f4f5b28aea13fdb9721eee22769ddfcd0dd01abfd1b603cd16911d381b216062e56554eb1e7b9d1f69e49d42303d908f2ec1d95';
const SYSTEM_PUBLIC_KEY_ADMIN =
  '04531f25f9388d13f62488aa58e9b284526d8e59235c691ee82f71df670113195e375bae035c7e80cbad778707e2eb4c43f9df00219eba220796eeaf568b1e3fbc';

export async function ensureSystemState() {
  await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { phone: SYSTEM_VAULT_PHONE },
      update: {
        publicKey: SYSTEM_PUBLIC_KEY_VAULT,
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
        publicKey: SYSTEM_PUBLIC_KEY_ADMIN,
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
