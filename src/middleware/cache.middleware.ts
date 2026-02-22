import { Request, Response, NextFunction } from 'express';
import { LRUCache } from 'lru-cache';
import logger from '../utils/logger';
import crypto from 'crypto';

// Intelligent caching system for API responses
class ApiCache {
  private cache: LRUCache<string, { data: any; timestamp: number; etag: string }>;
  private userCache: LRUCache<string, any>;
  
  constructor() {
    // Main response cache (5 minutes TTL)
    this.cache = new LRUCache<string, { data: any; timestamp: number; etag: string }>({
      max: 1000,
      ttl: 1000 * 60 * 5, // 5 minutes
      updateAgeOnGet: true,
    });
    
    // User-specific cache (15 minutes TTL)
    this.userCache = new LRUCache<string, any>({
      max: 500,
      ttl: 1000 * 60 * 15, // 15 minutes
    });
  }

  // Middleware for caching GET requests
  cacheMiddleware(duration: number = 300) {
    return (req: Request, res: Response, next: NextFunction) => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }

      const key = this.generateCacheKey(req);
      const cached = this.cache.get(key);

      if (cached) {
        // Check if cache is still valid based on duration
        const age = Date.now() - cached.timestamp;
        if (age < duration * 1000) {
          logger.debug(`Cache hit for ${req.path}`);
          
          // Set cache headers
          res.set({
            'X-Cache': 'HIT',
            'X-Cache-Age': Math.floor(age / 1000).toString(),
            'ETag': cached.etag,
          });

          // Check if client has fresh cache
          if (req.headers['if-none-match'] === cached.etag) {
            return res.status(304).end();
          }

          return res.json(cached.data);
        }
      }

      // Store original res.json
      const originalJson = res.json;
      
      // Override res.json to cache the response
      res.json = (data: any) => {
        // Don't cache error responses
        if (res.statusCode >= 400) {
          return originalJson.call(res, data);
        }

        // Cache the successful response
        const etag = this.generateETag(data);
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          etag,
        });

        // Set cache headers
        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Duration': duration.toString(),
          'ETag': etag,
          'Cache-Control': `public, max-age=${duration}`,
        });

        return originalJson.call(res, data);
      };

      next();
    };
  }

  // Middleware for caching user-specific data
  userCacheMiddleware(duration: number = 900) {
    return (req: Request, res: Response, next: NextFunction) => {
      const userId = this.extractUserId(req);
      if (!userId) {
        return next();
      }

      const key = `user:${userId}:${req.path}`;
      const cached = this.userCache.get(key);

      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < duration * 1000) {
          logger.debug(`User cache hit for ${userId} on ${req.path}`);
          return res.json(cached.data);
        }
      }

      // Store original res.json
      const originalJson = res.json;
      res.json = (data: any) => {
        if (res.statusCode < 400) {
          this.userCache.set(key, {
            data,
            timestamp: Date.now(),
          });
        }
        return originalJson.call(res, data);
      };

      next();
    };
  }

  // Invalidate cache for specific patterns
  invalidateCache(pattern: string | RegExp) {
    const keys = Array.from(this.cache.keys()) as string[];
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    let invalidated = 0;
    for (const key of keys) {
      if (regex.test(key)) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    
    logger.info(`Invalidated ${invalidated} cache entries matching pattern: ${pattern}`);
  }

  // Invalidate user-specific cache
  invalidateUserCache(userId: string) {
    const keys = Array.from(this.userCache.keys()) as string[];
    let invalidated = 0;
    
    for (const key of keys) {
      if (key.startsWith(`user:${userId}:`)) {
        this.userCache.delete(key);
        invalidated++;
      }
    }
    
    logger.info(`Invalidated ${invalidated} cache entries for user ${userId}`);
  }

  // Pre-warm cache with common data
  async warmCache() {
    logger.info('Starting cache warm-up...');
    
    // This would be called during server startup
    // to pre-populate cache with common queries
    
    logger.info('Cache warm-up completed');
  }

  private generateCacheKey(req: Request): string {
    const parts = [
      req.method,
      req.path,
      JSON.stringify(req.query),
      JSON.stringify(req.headers['authorization'] ? 'AUTH' : 'NO_AUTH'),
    ];
    
    return crypto.createHash('md5').update(parts.join('|')).digest('hex');
  }

  private extractUserId(req: Request): string | null {
    return req.headers['x-user-id'] as string || 
           req.body?.phone || 
           req.query?.phone as string || 
           null;
  }

  private generateETag(data: any): string {
    const dataString = JSON.stringify(data);
    return crypto.createHash('md5').update(dataString).digest('hex');
  }

  // Get cache statistics
  getStats() {
    return {
      cacheSize: this.cache.size,
      userCacheSize: this.userCache.size,
      cacheRatio: this.cache.size / this.cache.max,
      userCacheRatio: this.userCache.size / this.userCache.max,
    };
  }
}

// Create singleton instance
const apiCache = new ApiCache();

// Export middleware functions
export const cacheMiddleware = apiCache.cacheMiddleware.bind(apiCache);
export const userCacheMiddleware = apiCache.userCacheMiddleware.bind(apiCache);
export const invalidateCache = apiCache.invalidateCache.bind(apiCache);
export const invalidateUserCache = apiCache.invalidateUserCache.bind(apiCache);
export const warmCache = apiCache.warmCache.bind(apiCache);
export { apiCache };
