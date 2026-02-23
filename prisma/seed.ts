import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create sample users
  const user1 = await prisma.user.upsert({
    where: { phone: '+1234567890' },
    update: {},
    create: {
      email: 'john.doe@example.com',
      phone: '+1234567890',
      displayName: 'John Doe',
      publicKey: 'pub-key-1',
      balance: 2500.50
    }
  });

  const user2 = await prisma.user.upsert({
    where: { phone: '+0987654321' },
    update: {},
    create: {
      email: 'jane.smith@example.com',
      phone: '+0987654321',
      displayName: 'Jane Smith',
      publicKey: 'pub-key-2',
      balance: 1800.75
    }
  });

  const user3 = await prisma.user.upsert({
    where: { phone: '+1122334455' },
    update: {},
    create: {
      email: 'mike.johnson@example.com',
      phone: '+1122334455',
      displayName: 'Mike Johnson',
      publicKey: 'pub-key-3',
      balance: 3200.00
    }
  });

  // Create sample transactions
  await prisma.transaction.createMany({
    data: [
      {
        from: 'SYSTEM',
        to: user1.email || '',
        amount: 1000.00,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        description: 'Initial deposit',
        userId: user1.id
      },
      {
        from: user1.email || '',
        to: user2.email || '',
        amount: 250.00,
        type: 'TRANSFER',
        status: 'COMPLETED',
        description: 'Payment for services',
        userId: user1.id
      },
      {
        from: user2.email || '',
        to: user1.email || '',
        amount: 150.00,
        type: 'TRANSFER',
        status: 'COMPLETED',
        description: 'Refund',
        userId: user2.id
      },
      {
        from: 'SYSTEM',
        to: user2.email || '',
        amount: 500.00,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        description: 'Salary credit',
        userId: user2.id
      },
      {
        from: user3.email || '',
        to: 'EXTERNAL',
        amount: 450.00,
        type: 'WITHDRAWAL',
        status: 'COMPLETED',
        description: 'ATM withdrawal',
        userId: user3.id
      },
      {
        from: user3.email || '',
        to: user1.email || '',
        amount: 300.00,
        type: 'TRANSFER',
        status: 'COMPLETED',
        description: 'Gift payment',
        userId: user3.id
      },
      {
        from: 'SYSTEM',
        to: user3.email || '',
        amount: 2000.00,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        description: 'Investment returns',
        userId: user3.id
      },
      {
        from: user1.email || '',
        to: 'EXTERNAL',
        amount: 100.00,
        type: 'PAYMENT',
        status: 'COMPLETED',
        description: 'Online purchase',
        userId: user1.id
      },
      {
        from: user2.email || '',
        to: 'EXTERNAL',
        amount: 75.50,
        type: 'PAYMENT',
        status: 'COMPLETED',
        description: 'Restaurant bill',
        userId: user2.id
      },
      {
        from: user3.email || '',
        to: user2.email || '',
        amount: 500.00,
        type: 'TRANSFER',
        status: 'PENDING',
        description: 'Loan repayment',
        userId: user3.id
      }
    ]
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
