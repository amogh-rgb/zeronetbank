const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async()=>{
  try {
    const result = await prisma.$transaction(async (tx) => {
      const s = await tx.bankState.findUnique({ where: { id: 1 } });
      return s;
    }, { maxWait: 15000, timeout: 30000 });
    console.log('TX_OK', JSON.stringify(result));
  } catch (e) {
    console.error('TX_ERR', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
