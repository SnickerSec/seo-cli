import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateUrl,
  withRetry,
  RateLimiter,
  isRetryableError,
  formatBytes,
  formatDuration,
  setVerbose,
  isVerbose,
} from './utils.js';

describe('validateUrl', () => {
  it('should validate a proper URL with https', () => {
    const result = validateUrl('https://example.com');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });

  it('should validate a proper URL with http', () => {
    const result = validateUrl('http://example.com');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('http://example.com/');
  });

  it('should add https:// if protocol is missing', () => {
    const result = validateUrl('example.com');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });

  it('should handle URLs with paths', () => {
    const result = validateUrl('https://example.com/path/to/page');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/path/to/page');
  });

  it('should handle URLs with query strings', () => {
    const result = validateUrl('https://example.com?foo=bar');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/?foo=bar');
  });

  it('should reject invalid URLs', () => {
    const result = validateUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should reject URLs with invalid TLD', () => {
    const result = validateUrl('https://example.x');
    expect(result.valid).toBe(false);
  });

  it('should allow localhost', () => {
    const result = validateUrl('http://localhost:3000');
    expect(result.valid).toBe(true);
  });

  it('should trim whitespace', () => {
    const result = validateUrl('  https://example.com  ');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const promise = withRetry(fn, { maxRetries: 3 });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { maxRetries: 3, initialDelay: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries exceeded', async () => {
    vi.useRealTimers(); // Use real timers for this test
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelay: 10 }) // Short delay for fast test
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    vi.useFakeTimers(); // Restore fake timers
  });

  it('should respect retryOn condition', async () => {
    vi.useRealTimers(); // Use real timers for this test
    const nonRetryableError = new Error('not retryable');
    const fn = vi.fn().mockRejectedValue(nonRetryableError);

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        retryOn: (err) => err.message !== 'not retryable',
      })
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1); // No retries
    vi.useFakeTimers(); // Restore fake timers
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    withRetry(fn, {
      maxRetries: 3,
      initialDelay: 1000,
      backoffFactor: 2,
    });

    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000); // First retry after 1s
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000); // Second retry after 2s (1000 * 2)
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should allow requests up to the limit', async () => {
    const limiter = new RateLimiter(5);

    // Should allow 5 immediate requests
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
  });

  it('should delay when rate limit is exceeded', async () => {
    const limiter = new RateLimiter(2);

    await limiter.acquire();
    await limiter.acquire();

    // Third request should wait
    const acquirePromise = limiter.acquire();
    let resolved = false;
    acquirePromise.then(() => { resolved = true; });

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    await Promise.resolve(); // Let promise resolve
    expect(resolved).toBe(true);
  });
});

describe('isRetryableError', () => {
  it('should return true for network errors', () => {
    expect(isRetryableError(new Error('Network error'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
  });

  it('should return true for timeout errors', () => {
    expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
  });

  it('should return true for server errors', () => {
    expect(isRetryableError(new Error('HTTP 500'))).toBe(true);
    expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
  });

  it('should return true for rate limit errors', () => {
    expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('should return false for other errors', () => {
    expect(isRetryableError(new Error('Invalid input'))).toBe(false);
    expect(isRetryableError(new Error('Not found'))).toBe(false);
  });
});

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds correctly', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(60000)).toBe('1.0m');
    expect(formatDuration(90000)).toBe('1.5m');
  });
});

describe('verbose mode', () => {
  it('should track verbose state', () => {
    setVerbose(false);
    expect(isVerbose()).toBe(false);

    setVerbose(true);
    expect(isVerbose()).toBe(true);

    setVerbose(false);
    expect(isVerbose()).toBe(false);
  });
});
