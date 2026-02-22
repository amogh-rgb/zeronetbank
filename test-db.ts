import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

console.log('Testing DB Connection...');
console.log(`Host: ${process.env.DB_HOST}`);
console.log(`Port: ${process.env.DB_PORT}`);
console.log(`User: ${process.env.DB_USER}`);
console.log(`DB: ${process.env.DB_NAME}`);
console.log(`Pass: ${process.env.DB_PASSWORD}`);

const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function test() {
    try {
        await client.connect();
        console.log('✅ Connected successfully!');
        await client.end();
    } catch (e: any) {
        console.error('❌ Connection Failed:');
        console.error(e.message);
        console.error(e);
    }
}

test();
