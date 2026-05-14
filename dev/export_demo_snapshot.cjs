const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const usersRaw = await p.user.findMany({
    select: { phone: true, email: true, displayName: true, balance: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const txRaw = await p.transaction.findMany({
    select: { id: true, from: true, to: true, amount: true, type: true, status: true, timestamp: true, createdAt: true },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  const users = usersRaw.map((u) => ({ ...u, balance: Number(u.balance) }));
  const transactions = txRaw.map((t) => ({
    ...t,
    amount: Number(t.amount),
    timestamp: t.timestamp != null ? t.timestamp.toString() : null,
  }));

  const out = {
    generatedAt: new Date().toISOString(),
    counts: {
      users: await p.user.count(),
      transactions: await p.transaction.count(),
      emailOtps: await p.emailOtp.count(),
    },
    users,
    transactions,
  };
  fs.writeFileSync("./dev/demo_db_snapshot.json", JSON.stringify(out, null, 2));
  console.log("WROTE ./dev/demo_db_snapshot.json");
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
