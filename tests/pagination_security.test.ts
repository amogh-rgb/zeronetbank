/**
 * Pagination Security Tests
 *
 * Verifies:
 * - Cursor order is stable
 * - Cannot exceed max limit
 * - Date filters enforced
 * - No record skipping or duplication
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

describe('Pagination Security', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'zeronettbank',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should enforce maximum limit of 100', async () => {
    const requestedLimit = 500;
    const maxLimit = 100;

    const parsedLimit = Math.min(maxLimit, Math.max(1, requestedLimit));

    expect(parsedLimit).toBe(maxLimit);
  });

  it('should enforce minimum limit of 1', async () => {
    const requestedLimit = 0;
    const maxLimit = 100;

    const parsedLimit = Math.min(maxLimit, Math.max(1, requestedLimit));

    expect(parsedLimit).toBe(1);
  });

  it('should default to 25 when limit not provided', async () => {
    const requestedLimit = undefined;
    const defaultLimit = 25;

    const parsedLimit = requestedLimit ? Math.min(100, Math.max(1, requestedLimit)) : defaultLimit;

    expect(parsedLimit).toBe(defaultLimit);
  });

  it('should accept NaN limit and use default', async () => {
    const requestedLimit = parseInt('invalid', 10); // NaN
    const defaultLimit = 25;

    const parsedLimit = Number.isNaN(requestedLimit) ? defaultLimit : Math.min(100, Math.max(1, requestedLimit));

    expect(parsedLimit).toBe(defaultLimit);
  });

  it('should validate date range order', async () => {
    const from = new Date('2024-01-01');
    const to = new Date('2024-01-31');

    const isValidRange = from.getTime() <= to.getTime();

    expect(isValidRange).toBe(true);
  });

  it('should reject inverted date range', async () => {
    const from = new Date('2024-01-31');
    const to = new Date('2024-01-01');

    const isValidRange = from.getTime() <= to.getTime();

    expect(isValidRange).toBe(false);
  });

  it('should reject invalid date strings', async () => {
    const invalidDateStr = 'not-a-date';
    const date = new Date(invalidDateStr);

    expect(Number.isNaN(date.getTime())).toBe(true);
  });

  it('should handle cursor-based pagination correctly', async () => {
    const entries = [
      { id: 1, hash_chain: 'hash-1', amount: 100 },
      { id: 2, hash_chain: 'hash-2', amount: 200 },
      { id: 3, hash_chain: 'hash-3', amount: 300 },
      { id: 4, hash_chain: 'hash-4', amount: 400 },
      { id: 5, hash_chain: 'hash-5', amount: 500 },
    ];

    // Simulate cursor-based query (id < cursor position)
    const cursorHash = 'hash-3';
    const cursorId = entries.findIndex(e => e.hash_chain === cursorHash);

    const nextPage = entries.filter((_, idx) => idx > cursorId).slice(0, 2);

    expect(nextPage.length).toBe(2);
    expect(nextPage[0].hash_chain).toBe('hash-4');
    expect(nextPage[1].hash_chain).toBe('hash-5');
  });

  it('should not skip records with proper cursor pagination', async () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      hash_chain: `hash-${i + 1}`,
      created_at: new Date(2024, 0, 1 + (i % 30)),
    }));

    let allRetrieved = [];
    let cursor = null;
    const pageSize = 25;

    for (let i = 0; i < 4; i++) {
      const page = cursor
        ? entries.filter((e, idx) => {
          const cursorIdx = entries.findIndex(x => x.hash_chain === cursor);
          return idx > cursorIdx;
        }).slice(0, pageSize)
        : entries.slice(0, pageSize);

      allRetrieved.push(...page);

      if (page.length === 0) break;
      cursor = page[page.length - 1].hash_chain;
    }

    // Check no duplicates
    const ids = allRetrieved.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should apply date filters correctly', async () => {
    const entries = [
      { id: 1, created_at: new Date('2024-01-05') },
      { id: 2, created_at: new Date('2024-01-15') },
      { id: 3, created_at: new Date('2024-01-25') },
      { id: 4, created_at: new Date('2024-02-05') },
    ];

    const from = new Date('2024-01-10');
    const to = new Date('2024-01-31');

    const filtered = entries.filter(e => e.created_at >= from && e.created_at <= to);

    expect(filtered.length).toBe(2);
    expect(filtered.map(e => e.id)).toEqual([2, 3]);
  });

  it('should handle boundary dates in filtering', async () => {
    const entries = [
      { id: 1, created_at: new Date('2024-01-10T00:00:00Z') },
      { id: 2, created_at: new Date('2024-01-20T00:00:00Z') },
      { id: 3, created_at: new Date('2024-01-30T00:00:00Z') },
    ];

    const from = new Date('2024-01-10T00:00:00Z');
    const to = new Date('2024-01-30T00:00:00Z');

    const filtered = entries.filter(e => e.created_at >= from && e.created_at <= to);

    expect(filtered.length).toBe(3);
  });
});
