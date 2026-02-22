/**
 * Redis Service
 *
 * Used for:
 * - Nonce registry (replay protection)
 * - Idempotency locks
 * - WebSocket event pub/sub
 */

import Redis from 'ioredis';

export class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;

  connect(): void {
    const url = process.env.REDIS_URL;
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379');
    const password = process.env.REDIS_PASSWORD || undefined;

    if (url) {
      this.client = new Redis(url, { lazyConnect: false });
      this.subscriber = new Redis(url, { lazyConnect: false });
      return;
    }

    this.client = new Redis({ host, port, password, lazyConnect: false });
    this.subscriber = new Redis({ host, port, password, lazyConnect: false });
  }

  getClient(): Redis | null {
    return this.client;
  }

  getSubscriber(): Redis | null {
    return this.subscriber;
  }
}
