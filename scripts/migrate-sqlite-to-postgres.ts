import 'dotenv/config';
import { PrismaClient as PostgresPrisma } from '@prisma/client';
import { PrismaClient as SqlitePrisma } from '../src/generated/sqlite-client';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const sqliteUrl = requireEnv('SQLITE_DATABASE_URL');
  const postgresUrl = requireEnv('DATABASE_URL');

  if (!/^file:/.test(sqliteUrl)) {
    throw new Error('SQLITE_DATABASE_URL must point to a SQLite file: file:./dev.db');
  }
  if (!/^(postgres|postgresql):\/\//.test(postgresUrl)) {
    throw new Error('DATABASE_URL must point to PostgreSQL.');
  }

  const source = new SqlitePrisma({
    datasources: { db: { url: sqliteUrl } },
  });
  const target = new PostgresPrisma({
    datasources: { db: { url: postgresUrl } },
  });

  try {
    const [users, bankStateRows, transactions] = await Promise.all([
      source.user.findMany({ orderBy: { createdAt: 'asc' } }),
      source.bankState.findMany({ orderBy: { id: 'asc' } }),
      source.transaction.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);

    const userIdByPhone = new Map<string, string>();
    const userIdByPublicKey = new Map<string, string>();

    await target.$transaction(async (tx) => {
      for (const user of users) {
        const created = await tx.user.upsert({
          where: { phone: user.phone },
          update: {
            displayName: user.displayName,
            publicKey: user.publicKey,
            balance: user.balance,
            nonce: user.nonce,
            trustScore: user.trustScore,
            isFrozen: user.isFrozen,
            status: user.status,
            lastSeenAt: user.lastSeenAt,
            lastSyncAt: user.lastSyncAt,
            deviceInfo: user.deviceInfo,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          create: {
            id: user.id,
            phone: user.phone,
            displayName: user.displayName,
            publicKey: user.publicKey,
            balance: user.balance,
            nonce: user.nonce,
            trustScore: user.trustScore,
            isFrozen: user.isFrozen,
            status: user.status,
            lastSeenAt: user.lastSeenAt,
            lastSyncAt: user.lastSyncAt,
            deviceInfo: user.deviceInfo,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
        });

        userIdByPhone.set(created.phone, created.id);
        userIdByPublicKey.set(created.publicKey, created.id);
      }

      for (const state of bankStateRows) {
        await tx.bankState.upsert({
          where: { id: state.id },
          update: {
            vaultBalance: state.vaultBalance,
            updatedAt: state.updatedAt,
          },
          create: {
            id: state.id,
            vaultBalance: state.vaultBalance,
            updatedAt: state.updatedAt,
          },
        });
      }

      for (const row of transactions) {
        const fromUserId = userIdByPhone.get(row.from) || userIdByPublicKey.get(row.from) || null;
        const toUserId = userIdByPhone.get(row.to) || userIdByPublicKey.get(row.to) || null;

        await tx.transaction.upsert({
          where: { id: row.id },
          update: {
            from: row.from,
            to: row.to,
            fromUserId,
            toUserId,
            amount: row.amount,
            signature: row.signature,
            timestamp: row.timestamp,
            status: row.status,
            type: row.type,
            description: row.description,
            createdAt: row.createdAt,
          },
          create: {
            id: row.id,
            from: row.from,
            to: row.to,
            fromUserId,
            toUserId,
            amount: row.amount,
            signature: row.signature,
            timestamp: row.timestamp,
            status: row.status,
            type: row.type,
            description: row.description,
            createdAt: row.createdAt,
          },
        });
      }
    });

    console.log(
      `[sqlite->postgres] Migrated ${users.length} users, ${bankStateRows.length} bank state rows, ${transactions.length} transactions.`,
    );
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

main().catch((error) => {
  console.error('[sqlite->postgres] Migration failed:', error);
  process.exit(1);
});
