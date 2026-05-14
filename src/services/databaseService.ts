import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

export class DatabaseService {
  private static db: Database | null = null;

  /**
   * Initialize database connection
   */
  static async initialize(): Promise<void> {
    try {
      this.db = await open({
        filename: path.join(__dirname, '../../data/zeronetpay.db'),
        driver: sqlite3.Database
      });

      await this.createTables();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create necessary tables
   */
  private static async createTables(): Promise<void> {
    // Users table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE,
        email TEXT UNIQUE,
        vpa TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        wallet_id TEXT UNIQUE NOT NULL,
        balance REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // OTPs table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS otps (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(identifier)
      )
    `);

    // Transactions table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        from_wallet TEXT NOT NULL,
        to_wallet TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        metadata TEXT
      )
    `);

    // Audit logs table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        event_type TEXT NOT NULL,
        description TEXT,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Create indexes
    await this.execute('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_users_vpa ON users(vpa)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_otps_identifier ON otps(identifier)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_transactions_from_wallet ON transactions(from_wallet)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_transactions_to_wallet ON transactions(to_wallet)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)');
  }

  /**
   * Get database instance
   */
  static getDatabase(): Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Execute query
   */
  static async execute(query: string, params?: any[]): Promise<void> {
    const db = this.getDatabase();
    await db.run(query, params);
  }

  /**
   * Get single result
   */
  static async get(query: string, params?: any[]): Promise<any> {
    const db = this.getDatabase();
    return await db.get(query, params);
  }

  /**
   * Get multiple results
   */
  static async all(query: string, params?: any[]): Promise<any[]> {
    const db = this.getDatabase();
    return await db.all(query, params);
  }

  /**
   * Begin transaction
   */
  static async beginTransaction(): Promise<void> {
    await this.execute('BEGIN TRANSACTION');
  }

  /**
   * Commit transaction
   */
  static async commit(): Promise<void> {
    await this.execute('COMMIT');
  }

  /**
   * Rollback transaction
   */
  static async rollback(): Promise<void> {
    await this.execute('ROLLBACK');
  }

  /**
   * Close database connection
   */
  static async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
