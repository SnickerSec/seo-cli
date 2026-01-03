import * as cheerio from 'cheerio';
import type { CrawlResult, CrawlSummary } from '../types/index.js';
import { RateLimiter, debug, withRetry, isRetryableError } from './utils.js';

interface CrawlerOptions {
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  timeout: number;
  requestsPerSecond: number;
  onProgress?: (crawled: number, queued: number) => void;
}

interface QueueItem {
  url: string;
  depth: number;
  foundOn: string;
}

export class SiteCrawler {
  private baseUrl: URL;
  private options: CrawlerOptions;
  private visited: Set<string> = new Set();
  private results: Map<string, CrawlResult> = new Map();
  private queue: QueueItem[] = [];
  private activeRequests: number = 0;
  private rateLimiter: RateLimiter;

  constructor(startUrl: string, options: Partial<CrawlerOptions> = {}) {
    this.baseUrl = new URL(startUrl);
    this.options = {
      maxDepth: options.maxDepth ?? 3,
      maxPages: options.maxPages ?? 100,
      concurrency: options.concurrency ?? 5,
      timeout: options.timeout ?? 10000,
      requestsPerSecond: options.requestsPerSecond ?? 10,
      onProgress: options.onProgress,
    };

    this.rateLimiter = new RateLimiter(this.options.requestsPerSecond);
    debug(`Crawler initialized for ${startUrl}`, this.options);

    // Add start URL to queue
    this.queue.push({ url: this.normalizeUrl(startUrl), depth: 0, foundOn: 'start' });
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url, this.baseUrl.origin);
      // Remove hash and trailing slash
      parsed.hash = '';
      let normalized = parsed.href;
      if (normalized.endsWith('/') && normalized !== this.baseUrl.origin + '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }

  private isInternalUrl(url: string): boolean {
    try {
      const parsed = new URL(url, this.baseUrl.origin);
      return parsed.hostname === this.baseUrl.hostname;
    } catch {
      return false;
    }
  }

  private shouldCrawl(url: string): boolean {
    // Skip non-HTML resources
    const skipExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.css', '.js', '.xml', '.json', '.zip', '.mp4', '.mp3', '.wav', '.avi', '.mov'];
    const lowerUrl = url.toLowerCase();
    if (skipExtensions.some(ext => lowerUrl.endsWith(ext))) {
      return false;
    }

    // Skip common non-page paths
    const skipPatterns = ['/wp-admin', '/wp-content', '/wp-includes', '/feed', '/rss', '/xmlrpc'];
    if (skipPatterns.some(pattern => lowerUrl.includes(pattern))) {
      return false;
    }

    return true;
  }

  private async fetchPage(url: string): Promise<{ html: string; status: number } | null> {
    // Apply rate limiting
    await this.rateLimiter.acquire();
    debug(`Fetching: ${url}`);

    try {
      const result = await withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'SEO-CLI-Crawler/1.0 (https://github.com/seo-cli)',
              'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
          });

          clearTimeout(timeoutId);

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/html')) {
            debug(`Non-HTML content-type for ${url}: ${contentType}`);
            return { html: '', status: response.status };
          }

          const html = await response.text();
          debug(`Fetched ${url}: ${response.status}, ${html.length} bytes`);
          return { html, status: response.status };
        },
        {
          maxRetries: 2,
          initialDelay: 500,
          retryOn: isRetryableError,
        }
      );

      return result;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        debug(`Timeout fetching ${url}`);
        return { html: '', status: 408 }; // Timeout
      }
      debug(`Failed to fetch ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      return null;
    }
  }

  private parsePage(url: string, html: string, status: number): CrawlResult {
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim() || null;
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
    const h1 = $('h1').first().text().trim() || null;

    const issues: string[] = [];
    if (!title) issues.push('Missing title tag');
    if (!metaDescription) issues.push('Missing meta description');
    if (!h1) issues.push('Missing H1 tag');
    if (title && title.length > 60) issues.push('Title too long (>60 chars)');
    if (metaDescription && metaDescription.length > 160) issues.push('Meta description too long (>160 chars)');

    // Extract links
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('data:') && !href.startsWith('vbscript:')) {
        try {
          const absoluteUrl = new URL(href, url).href;
          links.push(absoluteUrl);
        } catch {
          // Invalid URL, skip
        }
      }
    });

    // Extract images
    const images: { src: string; alt: string | null }[] = [];
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt');
      if (src) {
        const absoluteSrc = new URL(src, url).href;
        images.push({
          src: absoluteSrc,
          alt: alt?.trim() || null,
        });
        if (!alt || alt.trim() === '') {
          issues.push(`Image missing alt text: ${absoluteSrc.substring(0, 50)}...`);
        }
      }
    });

    return {
      url,
      status,
      title,
      metaDescription,
      h1,
      issues,
      links,
      images,
    };
  }

  private async processUrl(item: QueueItem): Promise<void> {
    if (this.visited.has(item.url)) return;
    if (this.results.size >= this.options.maxPages) return;

    this.visited.add(item.url);
    this.activeRequests++;

    const pageData = await this.fetchPage(item.url);

    if (pageData) {
      const result = this.parsePage(item.url, pageData.html, pageData.status);
      this.results.set(item.url, result);

      // Add new links to queue if within depth limit
      if (item.depth < this.options.maxDepth && pageData.status === 200) {
        for (const link of result.links) {
          const normalizedLink = this.normalizeUrl(link);
          if (
            this.isInternalUrl(normalizedLink) &&
            !this.visited.has(normalizedLink) &&
            this.shouldCrawl(normalizedLink)
          ) {
            this.queue.push({
              url: normalizedLink,
              depth: item.depth + 1,
              foundOn: item.url,
            });
          }
        }
      }
    } else {
      // Failed to fetch
      this.results.set(item.url, {
        url: item.url,
        status: 0,
        title: null,
        metaDescription: null,
        h1: null,
        issues: ['Failed to fetch page'],
        links: [],
        images: [],
      });
    }

    this.activeRequests--;

    if (this.options.onProgress) {
      this.options.onProgress(this.results.size, this.queue.length);
    }
  }

  async crawl(): Promise<CrawlResult[]> {
    while (this.queue.length > 0 || this.activeRequests > 0) {
      // Process items up to concurrency limit
      while (this.queue.length > 0 && this.activeRequests < this.options.concurrency && this.results.size < this.options.maxPages) {
        const item = this.queue.shift();
        if (item && !this.visited.has(item.url)) {
          this.processUrl(item);
        }
      }

      // Small delay to prevent tight loop
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return Array.from(this.results.values());
  }

  generateSummary(results: CrawlResult[]): CrawlSummary {
    const brokenLinks: CrawlSummary['brokenLinks'] = [];
    const missingTitles: string[] = [];
    const missingMetaDescriptions: string[] = [];
    const missingH1s: string[] = [];
    const missingAltText: CrawlSummary['missingAltText'] = [];
    const titleMap: Map<string, string[]> = new Map();

    for (const result of results) {
      // Check for broken links (4xx, 5xx, or 0 for failed)
      if (result.status >= 400 || result.status === 0) {
        // Find which page linked to this
        const foundOn = results.find(r => r.links.includes(result.url))?.url || 'unknown';
        brokenLinks.push({ url: result.url, status: result.status, foundOn });
      }

      if (result.status === 200) {
        if (!result.title) missingTitles.push(result.url);
        if (!result.metaDescription) missingMetaDescriptions.push(result.url);
        if (!result.h1) missingH1s.push(result.url);

        // Track duplicate titles
        if (result.title) {
          const existing = titleMap.get(result.title) || [];
          existing.push(result.url);
          titleMap.set(result.title, existing);
        }

        // Check for missing alt text
        for (const img of result.images) {
          if (!img.alt) {
            missingAltText.push({ page: result.url, image: img.src });
          }
        }
      }
    }

    // Find duplicate titles
    const duplicateTitles: CrawlSummary['duplicateTitles'] = [];
    for (const [title, pages] of titleMap.entries()) {
      if (pages.length > 1) {
        duplicateTitles.push({ title, pages });
      }
    }

    return {
      totalPages: results.filter(r => r.status === 200).length,
      brokenLinks,
      missingTitles,
      missingMetaDescriptions,
      missingH1s,
      missingAltText,
      duplicateTitles,
    };
  }
}
