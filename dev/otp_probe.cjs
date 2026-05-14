const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async()=>{
  const row = await prisma.emailOtp.findFirst({ where: { email: 'amoghsram@gmail.com' }, orderBy: { createdAt: 'desc' } });
  console.log(JSON.stringify(row));
  await prisma.$disconnect();
})();
