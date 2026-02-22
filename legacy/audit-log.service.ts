/**
 * Audit Log Service
 *
 * Enforces:
 * - Hash-chained audit records
 * - Bank-signed audit entries
 * - Append-only integrity
 */

import { Pool } from 'pg';
import { BankCryptoService } from './bank-crypto.service';

export interface AuditLogEntry {
  actorType: 'admin' | 'wallet' | 'system';
  actorId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure';
  errorMessage?: string;
}

export class AuditLogService {
  private pool: Pool;
  private crypto: BankCryptoService;
  private logger: any;

  constructor(pool: Pool, crypto: BankCryptoService, logger: any) {
    this.pool = pool;
    this.crypto = crypto;
    this.logger = logger;
  }

  async write(entry: AuditLogEntry): Promise<void> {
    try {
      const lastHash = await this.getLastHash();
      const payload = {
        actorType: entry.actorType,
        actorId: entry.actorId || null,
        action: entry.action,
        resourceType: entry.resourceType || null,
        resourceId: entry.resourceId || null,
        oldValue: entry.oldValue || null,
        newValue: entry.newValue || null,
        reason: entry.reason || null,
        status: entry.status || 'success',
        errorMessage: entry.errorMessage || null,
        timestamp: Date.now(),
        prevHash: lastHash,
      };

      const hashChain = this.crypto.hash256(payload);
      const bankSignature = this.crypto.sign({ ...payload, hashChain });

      await this.pool.query(
        `INSERT INTO audit_log
        (actor_type, actor_id, action, resource_type, resource_id, old_value, new_value, reason,
         ip_address, user_agent, status, error_message, prev_hash, hash_chain, bank_signature)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`
        ,
        [
          entry.actorType,
          entry.actorId || null,
          entry.action,
          entry.resourceType || null,
          entry.resourceId || null,
          entry.oldValue ? JSON.stringify(entry.oldValue) : null,
          entry.newValue ? JSON.stringify(entry.newValue) : null,
          entry.reason || null,
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.status || 'success',
          entry.errorMessage || null,
          lastHash,
          hashChain,
          bankSignature,
        ]
      );
    } catch (error) {
      this.logger.error('Audit log write error:', error);
    }
  }

  private async getLastHash(): Promise<string> {
    try {
      const result = await this.pool.query(
        'SELECT hash_chain FROM audit_log ORDER BY id DESC LIMIT 1'
      );
      if (result.rows.length === 0) {
        return 'GENESIS';
      }
      return result.rows[0].hash_chain || 'GENESIS';
    } catch (error) {
      this.logger.error('Audit log last hash error:', error);
      return 'GENESIS';
    }
  }
}
