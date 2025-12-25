/**
 * Utility functions for SEO CLI
 */

// Global verbose flag
let verboseMode = false;

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
}

export function isVerbose(): boolean {
  return verboseMode;
}

export function debug(message: string, ...args: unknown[]): void {
  if (verboseMode) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] DEBUG:`, message, ...args);
  }
}

/**
 * URL Validation
 */
export interface UrlValidationResult {
  valid: boolean;
  url?: string;
  error?: string;
}

export function validateUrl(input: string): UrlValidationResult {
  // Handle missing protocol
  let urlString = input.trim();
  if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
    urlString = 'https://' + urlString;
  }

  try {
    const url = new URL(urlString);

    // Must have a valid hostname
    if (!url.hostname || url.hostname.length < 1) {
      return { valid: false, error: 'Invalid hostname' };
    }

    // Allow localhost for development
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return { valid: true, url: url.href };
    }

    // Check for valid TLD (basic check)
    const parts = url.hostname.split('.');
    if (parts.length < 2 || parts[parts.length - 1].length < 2) {
      return { valid: false, error: 'Invalid domain format' };
    }

    return { valid: true, url: url.href };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Retry with exponential backoff
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryOn?: (error: Error) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  retryOn: () => true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      debug(`Attempt ${attempt + 1}/${opts.maxRetries + 1}`);
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      if (attempt === opts.maxRetries) {
        debug(`All ${opts.maxRetries + 1} attempts failed`);
        break;
      }

      if (!opts.retryOn(lastError)) {
        debug(`Error is not retryable: ${lastError.message}`);
        break;
      }

      debug(`Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(requestsPerSecond: number = 10) {
    this.maxTokens = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.refillRate = requestsPerSecond;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      debug(`Rate limiter: acquired token, ${this.tokens.toFixed(2)} remaining`);
      return;
    }

    // Wait for token to become available
    const waitTime = ((1 - this.tokens) / this.refillRate) * 1000;
    debug(`Rate limiter: waiting ${waitTime.toFixed(0)}ms for token`);
    await sleep(waitTime);
    this.refill();
    this.tokens -= 1;
  }
}

/**
 * Helper functions
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a network/transient error worth retrying
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'network',
    'timeout',
    'econnreset',
    'econnrefused',
    'socket hang up',
    'etimedout',
    'enotfound',
    '429', // rate limited
    '500',
    '502',
    '503',
    '504',
  ];
  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in ms to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
