import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Setup temp cache dir before importing cache module to ensure it picks it up
const TEMP_CACHE_DIR = path.join(os.tmpdir(), `seo-cli-test-cache-${Date.now()}`);
process.env.SEO_CLI_CACHE_DIR = TEMP_CACHE_DIR;

import { getCache, setCache, clearCache, getCacheStats, withCache } from './cache.js';

describe('response caching library', () => {
  beforeAll(() => {
    // Ensure temp cache directory doesn't exist initially
    if (fs.existsSync(TEMP_CACHE_DIR)) {
      fs.rmSync(TEMP_CACHE_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear temp cache dir before each test to maintain test isolation
    if (fs.existsSync(TEMP_CACHE_DIR)) {
      fs.rmSync(TEMP_CACHE_DIR, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up temp cache directory after all tests
    if (fs.existsSync(TEMP_CACHE_DIR)) {
      fs.rmSync(TEMP_CACHE_DIR, { recursive: true, force: true });
    }
  });

  it('should set and get cache data correctly', () => {
    const data = { foo: 'bar', num: 42 };
    setCache('test', 'my-key', data, 10000);

    const cached = getCache<{ foo: string; num: number }>('test', 'my-key');
    expect(cached).toEqual(data);
  });

  it('should return null for non-existent cache keys', () => {
    const cached = getCache('test', 'missing-key');
    expect(cached).toBeNull();
  });

  it('should handle cache expiration correctly', () => {
    const data = { hello: 'world' };
    
    // Set cache with short TTL (e.g. 50ms)
    setCache('expiry-test', 'key1', data, 50);

    // Immediate get should succeed
    expect(getCache('expiry-test', 'key1')).toEqual(data);

    // Use fake timers or just wait for a short duration
    // Let's use fake timers for reliable time travel
    vi.useFakeTimers();
    
    // Set cache
    setCache('expiry-test', 'key2', data, 100);
    expect(getCache('expiry-test', 'key2')).toEqual(data);

    // Fast forward past TTL (150ms)
    vi.advanceTimersByTime(150);

    // Cache should now be expired
    expect(getCache('expiry-test', 'key2')).toBeNull();

    vi.useRealTimers();
  });

  it('should clear all cache files when no namespace is specified', () => {
    setCache('ns1', 'key1', 'val1');
    setCache('ns2', 'key2', 'val2');

    const statsBefore = getCacheStats();
    expect(statsBefore.entries).toBe(2);

    const cleared = clearCache();
    expect(cleared).toBe(2);

    const statsAfter = getCacheStats();
    expect(statsAfter.entries).toBe(0);
  });

  it('should clear cache files only for specified namespace', () => {
    setCache('ns1', 'key1', 'val1');
    setCache('ns1', 'key2', 'val2');
    setCache('ns2', 'key3', 'val3');

    const cleared = clearCache('ns1');
    expect(cleared).toBe(2);

    // ns2 should still exist
    const stats = getCacheStats();
    expect(stats.entries).toBe(1);
    expect(stats.namespaces).toEqual({ ns2: 1 });
  });

  it('should report correct cache stats', () => {
    setCache('stats1', 'key1', 'val1');
    setCache('stats2', 'key2', 'val2');
    setCache('stats2', 'key3', 'val3');

    const stats = getCacheStats();
    expect(stats.entries).toBe(3);
    expect(stats.namespaces).toEqual({
      stats1: 1,
      stats2: 2,
    });
    expect(stats.size).toBeGreaterThan(0);
  });

  it('should fetch and cache results using withCache', async () => {
    const expensiveOperation = vi.fn().mockResolvedValue('expensive-result');

    // First call: cache miss, function is invoked
    const res1 = await withCache('expensive', 'op-key', expensiveOperation, { ttl: 5000 });
    expect(res1).toBe('expensive-result');
    expect(expensiveOperation).toHaveBeenCalledTimes(1);

    // Second call: cache hit, cached value is returned directly
    const res2 = await withCache('expensive', 'op-key', expensiveOperation, { ttl: 5000 });
    expect(res2).toBe('expensive-result');
    expect(expensiveOperation).toHaveBeenCalledTimes(1); // Still 1

    // Third call: bypass is true, function is invoked again
    const res3 = await withCache('expensive', 'op-key', expensiveOperation, { ttl: 5000, bypass: true });
    expect(res3).toBe('expensive-result');
    expect(expensiveOperation).toHaveBeenCalledTimes(2);
  });
});
