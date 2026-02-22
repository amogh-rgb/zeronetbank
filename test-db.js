
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

console.log('Testing sqlite3...');
try {
    const db = await open({
        filename: ':memory:',
        driver: sqlite3.Database
    });
    console.log('✅ SQLite3 is working!');
    await db.close();
} catch (e) {
    console.error('❌ Error:', e);
}
