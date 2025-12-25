/**
 * Response caching for expensive API calls
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { debug } from './utils.js';

const CACHE_DIR = join(homedir(), '.seo-cli', 'cache');

// Default TTLs in milliseconds
const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour
const TTL_CONFIG: Record<string, number> = {
  moz: 24 * 60 * 60 * 1000,      // 24 hours - domain authority changes slowly
  pagespeed: 60 * 60 * 1000,     // 1 hour
  gsc: 30 * 60 * 1000,           // 30 minutes
  ga: 15 * 60 * 1000,            // 15 minutes
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(namespace: string, key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return `${namespace}_${hash}`;
}

function getCachePath(cacheKey: string): string {
  return join(CACHE_DIR, `${cacheKey}.json`);
}

/**
 * Get cached data if valid
 */
export function getCache<T>(namespace: string, key: string): T | null {
  ensureCacheDir();
  const cacheKey = getCacheKey(namespace, key);
  const cachePath = getCachePath(cacheKey);

  if (!existsSync(cachePath)) {
    debug(`Cache miss: ${namespace}/${key}`);
    return null;
  }

  try {
    const content = readFileSync(cachePath, 'utf-8');
    const entry = JSON.parse(content) as CacheEntry<T>;

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      debug(`Cache expired: ${namespace}/${key} (age: ${Math.round(age / 1000)}s)`);
      unlinkSync(cachePath);
      return null;
    }

    debug(`Cache hit: ${namespace}/${key} (age: ${Math.round(age / 1000)}s)`);
    return entry.data;
  } catch (e) {
    debug(`Cache read error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Store data in cache
 */
export function setCache<T>(namespace: string, key: string, data: T, ttl?: number): void {
  ensureCacheDir();
  const cacheKey = getCacheKey(namespace, key);
  const cachePath = getCachePath(cacheKey);

  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl: ttl ?? TTL_CONFIG[namespace] ?? DEFAULT_TTL,
  };

  try {
    writeFileSync(cachePath, JSON.stringify(entry));
    debug(`Cache set: ${namespace}/${key}`);
  } catch (e) {
    debug(`Cache write error: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

/**
 * Clear cache for a namespace or all cache
 */
export function clearCache(namespace?: string): number {
  ensureCacheDir();
  let cleared = 0;

  try {
    const files = readdirSync(CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      if (!namespace || file.startsWith(`${namespace}_`)) {
        unlinkSync(join(CACHE_DIR, file));
        cleared++;
      }
    }
  } catch (e) {
    debug(`Cache clear error: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  debug(`Cleared ${cleared} cache entries`);
  return cleared;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { entries: number; size: number; namespaces: Record<string, number> } {
  ensureCacheDir();
  const stats = {
    entries: 0,
    size: 0,
    namespaces: {} as Record<string, number>,
  };

  try {
    const files = readdirSync(CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(CACHE_DIR, file);
      const fileStat = statSync(filePath);
      stats.entries++;
      stats.size += fileStat.size;

      // Extract namespace from filename
      const namespace = file.split('_')[0];
      stats.namespaces[namespace] = (stats.namespaces[namespace] || 0) + 1;
    }
  } catch (e) {
    debug(`Cache stats error: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  return stats;
}

/**
 * Wrapper to cache async function results
 */
export async function withCache<T>(
  namespace: string,
  key: string,
  fn: () => Promise<T>,
  options: { ttl?: number; bypass?: boolean } = {}
): Promise<T> {
  if (!options.bypass) {
    const cached = getCache<T>(namespace, key);
    if (cached !== null) {
      return cached;
    }
  }

  const result = await fn();
  setCache(namespace, key, result, options.ttl);
  return result;
}
