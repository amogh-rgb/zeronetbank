
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bind to all interfaces for mobile access
const DB_FILE = './bank_database.sqlite';

// --- DIRNAME SETUP FOR ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- SETUP EXPRESS ---
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public'))); // Serve admin dashboard

// --- DATABASE SETUP ---
let db;

async function initDB() {
    db = await open({
        filename: DB_FILE,
        driver: sqlite3.Database
    });

    await db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      mobile_number TEXT PRIMARY KEY,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id TEXT,
      type TEXT, -- 'CREDIT' or 'DEBIT'
      amount REAL,
      description TEXT,
      created_at TEXT
    );
  `);
    console.log('✅ Database initialized');
}

// --- API ENDPOINTS ---

// 0. Root Check (Bank Status)
app.get('/', (req, res) => {
    res.status(200).json({ status: "ZeroNetBank API Live", bank: "ONLINE" });
});

// 0. Health Check (DB Status)
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK", db: 'connected' });
});

// 1. Register Wallet (Auto-create if not exists)
app.post('/api/wallet/register', async (req, res) => {
    console.log('📝 Register Request:', req.body);
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: 'Phone required' });
    }

    try {
        const existing = await db.get('SELECT * FROM wallets WHERE mobile_number = ?', phone);
        if (!existing) {
            await db.run('INSERT INTO wallets (mobile_number, created_at) VALUES (?, ?)',
                phone, new Date().toISOString());
            console.log(`🆕 Registered: ${phone}`);
        } else {
            console.log(`ℹ️ Exists: ${phone}`);
        }
        res.json({ success: true, phone });
    } catch (e) {
        console.error('Register Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Fetch Wallet Data (Balance + Transactions)
app.get('/api/wallet/:phone', async (req, res) => {
    const { phone } = req.params;
    console.log('🔍 Fetch Request:', phone);

    try {
        let wallet = await db.get('SELECT * FROM wallets WHERE mobile_number = ?', phone);
        if (!wallet) {
            // Auto-create on fetch?
            // The prompt implies we should force things to work.
            // If app asks for data, let's give it empty data for valid phone numbers.
            await db.run('INSERT INTO wallets (mobile_number, created_at) VALUES (?, ?)',
                phone, new Date().toISOString());
            wallet = { mobile_number: phone };
        }

        const txs = await db.all('SELECT * FROM transactions WHERE wallet_id = ? ORDER BY id DESC', phone);

        let balance = 0;
        const history = txs.map(t => {
            if (t.type === 'CREDIT') balance += t.amount;
            if (t.type === 'DEBIT') balance -= t.amount;
            return {
                type: t.type,
                amount: t.amount,
                note: t.description,
                timestamp: new Date(t.created_at).getTime(),
                time: t.created_at
            };
        });

        // Backend is the Single Source of Truth for balance
        res.json({
            phone,
            balance,
            transactions: history
        });
    } catch (e) {
        console.error('Fetch Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 2.5 Sync Endpoint (For App Sync Logic)
app.post('/api/wallet/sync', async (req, res) => {
    console.log('🔄 Sync Request:', req.body);
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: 'Phone required' });
    }

    try {
        let wallet = await db.get('SELECT * FROM wallets WHERE mobile_number = ?', phone);
        if (!wallet) {
            await db.run('INSERT INTO wallets (mobile_number, created_at) VALUES (?, ?)',
                phone, new Date().toISOString());
        }

        const txs = await db.all('SELECT * FROM transactions WHERE wallet_id = ? ORDER BY id DESC', phone);

        let balance = 0;
        const history = txs.map(t => {
            if (t.type === 'CREDIT') balance += t.amount;
            if (t.type === 'DEBIT') balance -= t.amount;
            return {
                type: t.type,
                amount: t.amount,
                note: t.description,
                timestamp: new Date(t.created_at).getTime(), // Ensure timestamp is int for Flutter sort
                time: t.created_at,
                // Add receiver/sender fields for UI compatibility if needed
                receiver: t.type === 'DEBIT' ? 'External' : phone,
                sender: t.type === 'CREDIT' ? 'Bank' : phone
            };
        });

        res.json({
            bankOnline: true,
            balance,
            transactions: history
        });
    } catch (e) {
        console.error('Sync Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 3. App Transaction (Debit)
app.post('/api/wallet/transaction', async (req, res) => {
    console.log('💸 Transaction Request:', req.body);
    const { phone, amount, note } = req.body;

    if (!phone || !amount) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        await db.run(
            'INSERT INTO transactions (wallet_id, type, amount, description, created_at) VALUES (?, ?, ?, ?, ?)',
            phone, 'DEBIT', amount, note || 'App Transfer', new Date().toISOString()
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Transaction Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 4. Admin Credit (Add Money)
app.post('/api/admin/credit', async (req, res) => {
    console.log('💰 Credit Request:', req.body);
    const { phone, amount, note } = req.body;

    if (!phone || !amount) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        await db.run(
            'INSERT INTO transactions (wallet_id, type, amount, description, created_at) VALUES (?, ?, ?, ?, ?)',
            phone, 'CREDIT', amount, note || 'Admin Credit', new Date().toISOString()
        );
        res.json({ success: true, phone, amount });
    } catch (e) {
        console.error('Credit Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN API FOR DASHBOARD ---
app.get('/api/admin/wallets', async (req, res) => {
    try {
        const wallets = await db.all('SELECT * FROM wallets');
        // enrich with balance
        for (let w of wallets) {
            const txs = await db.all('SELECT * FROM transactions WHERE wallet_id = ?', w.mobile_number);
            let balance = 0;
            txs.forEach((t) => {
                if (t.type === 'CREDIT') balance += t.amount;
                if (t.type === 'DEBIT') balance -= t.amount;
            });
            w.balance = balance;
        }
        res.json(wallets);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- GLOBAL 404 HANDLER ONLY FOR API ---
// This ensures we see the real error when something is not found
app.use((req, res, next) => {
    console.log("❌ 404 Route hit:", req.method, req.originalUrl);
    res.status(404).json({ error: "Route not found", path: req.originalUrl });
});


// --- START SERVER ---
initDB().then(() => {
    app.listen(PORT, HOST, () => {
        console.log(`🚀 ZeroNetBank Simple Server running on http://${HOST}:${PORT}`);
        console.log(`📂 Admin Dashboard: http://localhost:${PORT}/admin.html`);
    });
});
