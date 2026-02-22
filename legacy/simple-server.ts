
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// --- CONFIGURATION ---
const PORT = 3000;
const DB_FILE = './bank_database.sqlite';

// --- SETUP EXPRESS ---
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public'))); // Serve admin dashboard

// --- DATABASE SETUP ---
let db: any;

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

// 1. Register Wallet (Auto-create if not exists)
app.post('/api/wallet/register', async (req, res) => {
  const { phone } = req.body; // Changed from mobileNumber to match Flutter

  if (!phone) {
    return res.status(400).json({ error: 'Phone number required' });
  }

  try {
    const existing = await db.get('SELECT * FROM wallets WHERE mobile_number = ?', phone);
    if (!existing) {
      await db.run('INSERT INTO wallets (mobile_number, created_at) VALUES (?, ?)',
        phone, new Date().toISOString());
      console.log(`🆕 Registered wallet: ${phone}`);
    } else {
      console.log(`ℹ️ Wallet already exists: ${phone}`);
    }
    // Return wallet object structurally similar to sync
    res.json({
      success: true,
      wallet: {
        phone,
        balance: 0
      }
    });
  } catch (e: any) {
    console.error('Register Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 2. Sync Wallet (Auto-create + Fetch Data)
app.post('/api/wallet/sync', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number required' });
  }

  try {
    // 1. Auto-create if missing
    let wallet = await db.get('SELECT * FROM wallets WHERE mobile_number = ?', phone);
    if (!wallet) {
      await db.run('INSERT INTO wallets (mobile_number, created_at) VALUES (?, ?)',
        phone, new Date().toISOString());
      console.log(`🆕 Auto-created undefined wallet on Sync: ${phone}`);
      wallet = { mobile_number: phone, created_at: new Date().toISOString() };
    }

    // 2. Calc Balance
    const txs = await db.all('SELECT * FROM transactions WHERE wallet_id = ? ORDER BY id DESC', phone);

    let balance = 0;
    txs.forEach((t: any) => {
      if (t.type === 'CREDIT') balance += t.amount;
      if (t.type === 'DEBIT') balance -= t.amount;
    });

    // 3. Return robust response
    res.json({
      bankOnline: true,
      wallet: {
        phone: phone,
        balance: balance
      },
      transactions: txs
    });
  } catch (e: any) {
    console.error('Sync Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 3. App Transaction (Debit)
app.post('/api/wallet/transaction', async (req, res) => {
  const { phone, amount, description } = req.body;

  if (!phone || !amount) {
    console.warn(`⚠️ Transaction failed: Missing fields. Phone: ${phone}, Amount: ${amount}`);
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    await db.run(
      'INSERT INTO transactions (wallet_id, type, amount, description, created_at) VALUES (?, ?, ?, ?, ?)',
      phone, 'DEBIT', amount, description || 'App Transaction', new Date().toISOString()
    );
    console.log(`💸 Debit: ${phone} - ${amount}`);
    res.json({ success: true });
  } catch (e: any) {
    console.error('Transaction Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 4. Admin Credit (Add Money)
app.post('/api/admin/credit', async (req, res) => {
  const { phone, amount, description } = req.body; // mobileNumber -> phone

  if (!phone || !amount) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Ensure wallet exists before crediting
    const existing = await db.get('SELECT * FROM wallets WHERE mobile_number = ?', phone);
    if (!existing) {
      await db.run('INSERT INTO wallets (mobile_number, created_at) VALUES (?, ?)',
        phone, new Date().toISOString());
      console.log(`🆕 Auto-created wallet for ADMIN CREDIT: ${phone}`);
    }

    await db.run(
      'INSERT INTO transactions (wallet_id, type, amount, description, created_at) VALUES (?, ?, ?, ?, ?)',
      phone, 'CREDIT', amount, description || 'Admin Credit', new Date().toISOString()
    );
    console.log(`💰 Credit: ${phone} + ${amount}`);
    res.json({ success: true });
  } catch (e: any) {
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
      txs.forEach((t: any) => {
        if (t.type === 'CREDIT') balance += t.amount;
        if (t.type === 'DEBIT') balance -= t.amount;
      });
      w.balance = balance;
    }
    res.json(wallets);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// --- START SERVER ---
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ZeroNetBank Simple Server running on http://0.0.0.0:${PORT}`);
    console.log(`📂 Admin Dashboard: http://localhost:${PORT}/admin.html`);
  });
});
