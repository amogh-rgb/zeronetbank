import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = global as unknown as {
    prisma: PrismaClient<Prisma.PrismaClientOptions, 'query'>
};

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
        ],
    });

export async function connectPrismaWithRetry() {
    const retries = Number(process.env.DATABASE_CONNECT_RETRIES || 5);
    const backoffMs = Number(process.env.DATABASE_CONNECT_BACKOFF_MS || 3000);

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            await prisma.$connect();
            return;
        } catch (error) {
            if (attempt === retries) throw error;
            console.warn(
                `[Prisma] Connection attempt ${attempt}/${retries} failed. Retrying in ${backoffMs}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
    }
}

if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    prisma.$on('query', (e) => {
        // Clean up verbose Prisma SQL output
        const cleanQuery = e.query
            .replace(/`main`\./g, '') // Remove redundant database prefix
            .replace(/`/g, '');      // Remove backticks

        console.log('\n\x1b[36m[Prisma Query]\x1b[0m \x1b[90m+' + e.duration + 'ms\x1b[0m');
        console.log(`\x1b[34mSQL:\x1b[0m \x1b[32m${cleanQuery}\x1b[0m`);
        if (e.params && e.params !== '[]') {
            console.log(`\x1b[34mParams:\x1b[0m \x1b[33m${e.params}\x1b[0m`);
        }
    });
}
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
