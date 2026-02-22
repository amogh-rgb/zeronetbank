/**
 * WebSocket Hub
 *
 * ✅ SAFE: Emits event-only notifications (no money data, no balances, no transactions)
 * 
 * Allowed Events:
 * - Trust score changes
 * - Containment mode changes
 * - Account freeze/unfreeze
 * - System health status
 * 
 * ❌ FORBIDDEN: Balance, transaction details, private wallet info
 */

import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type Redis from 'ioredis';

export type BankEventType =
  | 'CREDIT_AVAILABLE'       // ✅ Safe: Just notification, no amount
  | 'ACCOUNT_FROZEN'         // ✅ Safe: Status change only
  | 'BANK_TRUTH_UPDATED'     // ✅ Safe: Metadata change
  | 'RISK_ALERT'             // ✅ Safe: Alert notification
  | 'TRUST_SCORE_CHANGED'    // ✅ Safe: Score level change
  | 'CONTAINMENT_ACTIVATED'  // ✅ Safe: Mode change
  | 'SYSTEM_HEALTH';         // ✅ Safe: Status check

export interface BankEvent {
  type: BankEventType;
  walletId?: string;
  timestamp: number;
  payload?: Record<string, any>; // Must NOT contain: balance, transactions, private keys
}

export class WebSocketHub {
  private wss: WebSocketServer;
  private redisSubscriber: Redis | null;
  private redisPublisher: Redis | null;

  constructor(server: HttpServer, redisPublisher: Redis | null, redisSubscriber: Redis | null) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.redisSubscriber = redisSubscriber;
    this.redisPublisher = redisPublisher;

    this.wss.on('connection', (socket: WebSocket) => {
      socket.send(JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() }));
    });

    if (this.redisSubscriber) {
      this.redisSubscriber.subscribe('bank-events');
      this.redisSubscriber.on('message', (_channel, message) => {
        this.broadcastRaw(message);
      });
    }
  }

  broadcast(event: BankEvent): void {
    const payload = JSON.stringify(event);

    if (this.redisPublisher) {
      this.redisPublisher.publish('bank-events', payload);
      return;
    }

    this.broadcastRaw(payload);
  }

  private broadcastRaw(message: string): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}
