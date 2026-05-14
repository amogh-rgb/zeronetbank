const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const users = await p.user.count();
  const tx = await p.transaction.count();
  const otp = await p.emailOtp.count();
  console.log(JSON.stringify({ users, transactions: tx, emailOtps: otp }, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
