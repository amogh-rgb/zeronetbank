const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Creating database tables...');
  
  // Create initial bank state
  await prisma.bankState.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      vaultBalance: 1000000.0
    }
  });
  
  console.log('Database tables created successfully!');
}

main()
  .catch((e) => {
    console.error('Error creating tables:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
