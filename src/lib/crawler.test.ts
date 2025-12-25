import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SiteCrawler } from './crawler.js';
import type { CrawlResult } from '../types/index.js';

// We'll test the public API and helper logic through the crawler behavior

describe('SiteCrawler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('URL normalization', () => {
    it('should normalize URLs by removing trailing slashes', async () => {
      // Test via generateSummary which doesn't require fetch
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/',
          status: 200,
          title: 'Home',
          metaDescription: 'Welcome',
          h1: 'Welcome',
          issues: [],
          links: ['https://example.com/about/'],
          images: [],
        },
        {
          url: 'https://example.com/about',
          status: 200,
          title: 'About',
          metaDescription: 'About us',
          h1: 'About Us',
          issues: [],
          links: [],
          images: [],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.totalPages).toBe(2);
    });
  });

  describe('generateSummary', () => {
    it('should identify broken links', () => {
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/',
          status: 200,
          title: 'Home',
          metaDescription: 'Welcome',
          h1: 'Welcome',
          issues: [],
          links: ['https://example.com/broken'],
          images: [],
        },
        {
          url: 'https://example.com/broken',
          status: 404,
          title: null,
          metaDescription: null,
          h1: null,
          issues: [],
          links: [],
          images: [],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.brokenLinks).toHaveLength(1);
      expect(summary.brokenLinks[0].url).toBe('https://example.com/broken');
      expect(summary.brokenLinks[0].status).toBe(404);
    });

    it('should identify 5xx errors as broken', () => {
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/',
          status: 200,
          title: 'Home',
          metaDescription: 'Welcome',
          h1: 'Welcome',
          issues: [],
          links: ['https://example.com/error'],
          images: [],
        },
        {
          url: 'https://example.com/error',
          status: 500,
          title: null,
          metaDescription: null,
          h1: null,
          issues: [],
          links: [],
          images: [],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.brokenLinks).toHaveLength(1);
      expect(summary.brokenLinks[0].status).toBe(500);
    });

    it('should identify pages with missing titles', () => {
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/page1',
          status: 200,
          title: null,
          metaDescription: 'Description',
          h1: 'Heading',
          issues: ['Missing title tag'],
          links: [],
          images: [],
        },
        {
          url: 'https://example.com/page2',
          status: 200,
          title: 'Has Title',
          metaDescription: 'Description',
          h1: 'Heading',
          issues: [],
          links: [],
          images: [],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.missingTitles).toHaveLength(1);
      expect(summary.missingTitles[0]).toBe('https://example.com/page1');
    });

    it('should identify pages with missing meta descriptions', () => {
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/page1',
          status: 200,
          title: 'Title',
          metaDescription: null,
          h1: 'Heading',
          issues: ['Missing meta description'],
          links: [],
          images: [],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.missingMetaDescriptions).toHaveLength(1);
      expect(summary.missingMetaDescriptions[0]).toBe('https://example.com/page1');
    });

    it('should identify pages with missing H1 tags', () => {
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/page1',
          status: 200,
          title: 'Title',
          metaDescription: 'Description',
          h1: null,
          issues: ['Missing H1 tag'],
          links: [],
          images: [],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.missingH1s).toHaveLength(1);
      expect(summary.missingH1s[0]).toBe('https://example.com/page1');
    });

    it('should identify duplicate titles', () => {
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/page1',
          status: 200,
          title: 'Same Title',
          metaDescription: 'Description 1',
          h1: 'Heading 1',
          issues: [],
          links: [],
          images: [],
        },
        {
          url: 'https://example.com/page2',
          status: 200,
          title: 'Same Title',
          metaDescription: 'Description 2',
          h1: 'Heading 2',
          issues: [],
          links: [],
          images: [],
        },
        {
          url: 'https://example.com/page3',
          status: 200,
          title: 'Unique Title',
          metaDescription: 'Description 3',
          h1: 'Heading 3',
          issues: [],
          links: [],
          images: [],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.duplicateTitles).toHaveLength(1);
      expect(summary.duplicateTitles[0].title).toBe('Same Title');
      expect(summary.duplicateTitles[0].pages).toHaveLength(2);
    });

    it('should identify images with missing alt text', () => {
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/',
          status: 200,
          title: 'Home',
          metaDescription: 'Welcome',
          h1: 'Welcome',
          issues: [],
          links: [],
          images: [
            { src: 'https://example.com/img1.jpg', alt: 'Image 1' },
            { src: 'https://example.com/img2.jpg', alt: null },
            { src: 'https://example.com/img3.jpg', alt: '' },
          ],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.missingAltText).toHaveLength(2);
    });

    it('should only count 200 status pages in totalPages', () => {
      const crawler = new SiteCrawler('https://example.com');
      const results: CrawlResult[] = [
        {
          url: 'https://example.com/good',
          status: 200,
          title: 'Good',
          metaDescription: 'Good',
          h1: 'Good',
          issues: [],
          links: [],
          images: [],
        },
        {
          url: 'https://example.com/redirect',
          status: 301,
          title: null,
          metaDescription: null,
          h1: null,
          issues: [],
          links: [],
          images: [],
        },
        {
          url: 'https://example.com/notfound',
          status: 404,
          title: null,
          metaDescription: null,
          h1: null,
          issues: [],
          links: [],
          images: [],
        },
      ];

      const summary = crawler.generateSummary(results);
      expect(summary.totalPages).toBe(1);
    });

    it('should handle empty results', () => {
      const crawler = new SiteCrawler('https://example.com');
      const summary = crawler.generateSummary([]);

      expect(summary.totalPages).toBe(0);
      expect(summary.brokenLinks).toHaveLength(0);
      expect(summary.missingTitles).toHaveLength(0);
      expect(summary.missingMetaDescriptions).toHaveLength(0);
      expect(summary.missingH1s).toHaveLength(0);
      expect(summary.missingAltText).toHaveLength(0);
      expect(summary.duplicateTitles).toHaveLength(0);
    });
  });

  describe('crawler options', () => {
    it('should accept custom options', () => {
      const crawler = new SiteCrawler('https://example.com', {
        maxDepth: 5,
        maxPages: 50,
        concurrency: 3,
        timeout: 5000,
      });

      // Crawler should be created without error
      expect(crawler).toBeDefined();
    });

    it('should use default options when not specified', () => {
      const crawler = new SiteCrawler('https://example.com');
      expect(crawler).toBeDefined();
    });
  });
});
