import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { LRUCache } from 'lru-cache';
import logger from '../utils/logger';

// Intelligent rate limiting with adaptive limits and caching
class IntelligentRateLimiter {
  private requestCache: LRUCache<string, number>;
  private userCache: LRUCache<string, { count: number; lastRequest: number; tier: string }>;
  
  constructor() {
    // Cache for request patterns (1 hour TTL)
    this.requestCache = new LRUCache<string, number>({
      max: 10000,
      ttl: 1000 * 60 * 60, // 1 hour
    });
    
    // User-specific cache with tier-based limits
    this.userCache = new LRUCache<string, { count: number; lastRequest: number; tier: string }>({
      max: 5000,
      ttl: 1000 * 60 * 15, // 15 minutes
    });
  }

  // Adaptive rate limiting based on user tier and request pattern
  createAdaptiveLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: (req: Request) => this.getDynamicLimit(req),
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => this.generateKey(req),
      skip: (req: Request) => this.shouldSkip(req),
      handler: (req: Request, res: Response) => this.handleRateLimit(req, res),
    });
  }

  // Create specialized limiters for different endpoints
  createSyncLimiter() {
    return rateLimit({
      windowMs: 5 * 60 * 1000, // 5 minutes for sync
      max: 50, // Higher limit for sync operations
      keyGenerator: (req: Request) => `sync:${this.getClientIP(req)}:${this.extractUserId(req)}`,
      handler: (req: Request, res: Response) => {
        logger.warn(`Sync rate limit exceeded for ${this.getClientIP(req)}`);
        res.status(429).json({
          status: 429,
          error: 'Sync rate limit exceeded. Please wait a moment.',
          retryAfter: 300, // 5 minutes
        });
      },
    });
  }

  createTransactionLimiter() {
    return rateLimit({
      windowMs: 60 * 1000, // 1 minute for transactions
      max: 20, // Moderate limit for transactions
      keyGenerator: (req: Request) => `tx:${this.extractUserId(req)}`,
      handler: (req: Request, res: Response) => {
        logger.warn(`Transaction rate limit exceeded for user ${this.extractUserId(req)}`);
        res.status(429).json({
          status: 429,
          error: 'Transaction rate limit exceeded. Please wait before making another transaction.',
          retryAfter: 60,
        });
      },
    });
  }

  private getDynamicLimit(req: Request): number {
    const userId = this.extractUserId(req);
    const userData = this.userCache.get(userId);
    
    if (!userData) {
      // New user gets standard limit
      return 100;
    }

    // Tier-based limits
    switch (userData.tier) {
      case 'premium':
        return 500;
      case 'verified':
        return 200;
      case 'basic':
        return 100;
      default:
        return 50;
    }
  }

  private generateKey(req: Request): string {
    const userId = this.extractUserId(req);
    const endpoint = req.path;
    const clientIP = this.getClientIP(req);
    return `${clientIP}:${userId}:${endpoint}`;
  }

  private shouldSkip(req: Request): boolean {
    // Skip rate limiting for health checks and admin endpoints
    if (req.path === '/health' || req.path === '/') return true;
    if (req.path.startsWith('/admin')) return true;
    
    // Skip for authenticated admin users
    if (req.headers['x-admin-auth']) return true;
    
    return false;
  }

  private extractUserId(req: Request): string {
    // Try to get user ID from various sources
    const userId = req.headers['x-user-id'] as string || 
                   req.body?.phone || 
                   req.query?.phone || 
                   this.getClientIP(req);
    
    return userId.toString();
  }

  private handleRateLimit(req: Request, res: Response) {
    const userId = this.extractUserId(req);
    logger.warn(`Rate limit exceeded for user ${userId} from ${this.getClientIP(req)} on ${req.path}`);
    
    res.status(429).json({
      status: 429,
      error: 'Too many requests, please try again later.',
      retryAfter: this.calculateRetryAfter(userId),
      endpoint: req.path,
    });
  }

  private calculateRetryAfter(userId: string): number {
    const userData = this.userCache.get(userId);
    if (!userData) return 300; // 5 minutes default
    
    const timeSinceLastRequest = Date.now() - userData.lastRequest;
    
    // Adaptive retry time based on user tier and request pattern
    if (userData.tier === 'premium') {
      return Math.max(60, 300 - timeSinceLastRequest / 1000);
    } else {
      return Math.max(120, 600 - timeSinceLastRequest / 1000);
    }
  }

  // Method to update user tier (call this after user verification)
  updateUserTier(userId: string, tier: 'basic' | 'verified' | 'premium') {
    const existing = this.userCache.get(userId) || { count: 0, lastRequest: Date.now(), tier: 'basic' };
    this.userCache.set(userId, { ...existing, tier });
    logger.info(`Updated user ${userId} tier to ${tier}`);
  }

  // Method to track request patterns for better rate limiting
  trackRequest(userId: string, endpoint: string) {
    const key = `${userId}:${endpoint}`;
    const current = this.requestCache.get(key) || 0;
    this.requestCache.set(key, current + 1);
    
    // Update user cache
    const userData = this.userCache.get(userId) || { count: 0, lastRequest: Date.now(), tier: 'basic' };
    this.userCache.set(userId, {
      count: userData.count + 1,
      lastRequest: Date.now(),
      tier: userData.tier
    });
  }

  // Helper method to get client IP safely (IPv6 compatible)
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}

// Create singleton instance
const intelligentLimiter = new IntelligentRateLimiter();

// Export different limiters for different use cases
export const adaptiveLimiter = intelligentLimiter.createAdaptiveLimiter();
export const syncLimiter = intelligentLimiter.createSyncLimiter();
export const transactionLimiter = intelligentLimiter.createTransactionLimiter();

// Export the limiter instance for tier management
export { intelligentLimiter };

// Legacy compatibility
export const apiLimiter = adaptiveLimiter;
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Increased from 10 to 20
  message: {
    status: 429,
    error: 'Too many accounts created from this IP, please try again after an hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
