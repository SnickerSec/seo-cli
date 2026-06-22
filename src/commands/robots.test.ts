import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, analyzeRobots } from './robots.js';
import type { RobotsResult } from './robots.js';

describe('robots.txt parser', () => {
  it('should parse basic rules correctly', () => {
    const content = `
User-agent: *
Disallow: /admin
Allow: /public
Crawl-delay: 2
Sitemap: https://example.com/sitemap.xml
`;
    const { rules, sitemaps } = parseRobotsTxt(content);

    expect(sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({
      userAgent: '*',
      rules: [
        { type: 'disallow', path: '/admin' },
        { type: 'allow', path: '/public' },
      ],
      crawlDelay: 2,
    });
  });

  it('should parse multiple user agents', () => {
    const content = `
User-agent: googlebot
Disallow: /private

User-agent: bingbot
Disallow: /temp
`;
    const { rules } = parseRobotsTxt(content);

    expect(rules).toHaveLength(2);
    expect(rules[0].userAgent).toBe('googlebot');
    expect(rules[0].rules).toEqual([{ type: 'disallow', path: '/private' }]);
    expect(rules[1].userAgent).toBe('bingbot');
    expect(rules[1].rules).toEqual([{ type: 'disallow', path: '/temp' }]);
  });

  it('should ignore comments and empty lines', () => {
    const content = `
# This is a full line comment
User-agent: * # inline agent comment
Disallow: /admin # block admin area
Allow: / # allow root
Crawl-delay: 5 # crawl delay comment
Sitemap: https://example.com/sitemap.xml # sitemap url comment
`;
    const { rules, sitemaps } = parseRobotsTxt(content);

    expect(sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({
      userAgent: '*',
      rules: [
        { type: 'disallow', path: '/admin' },
        { type: 'allow', path: '/' },
      ],
      crawlDelay: 5,
    });
  });

  it('should handle case insensitivity in directives', () => {
    const content = `
USER-AGENT: *
DISALLOW: /admin
ALLOW: /public
CRAWL-DELAY: 3.5
SITEMAP: https://example.com/sitemap.xml
`;
    const { rules, sitemaps } = parseRobotsTxt(content);

    expect(sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({
      userAgent: '*',
      rules: [
        { type: 'disallow', path: '/admin' },
        { type: 'allow', path: '/public' },
      ],
      crawlDelay: 3.5,
    });
  });
});

describe('robots.txt analyzer', () => {
  it('should warn when robots.txt is missing', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: false,
      sitemaps: [],
      rules: [],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).toContain('robots.txt file not found - all crawlers allowed by default');
  });

  it('should warn when no user agents rules are defined', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: true,
      sitemaps: ['https://example.com/sitemap.xml'],
      rules: [],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).toContain('No user-agent rules defined');
  });

  it('should detect when all bots are blocked from the root', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: true,
      sitemaps: ['https://example.com/sitemap.xml'],
      rules: [
        {
          userAgent: '*',
          rules: [{ type: 'disallow', path: '/' }],
        },
      ],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).toContain('WARNING: All crawlers are blocked from the entire site');
  });

  it('should not warn about blocking all bots if root is explicitly allowed later', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: true,
      sitemaps: ['https://example.com/sitemap.xml'],
      rules: [
        {
          userAgent: '*',
          rules: [
            { type: 'disallow', path: '/' },
            { type: 'allow', path: '/' },
          ],
        },
      ],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).not.toContain('WARNING: All crawlers are blocked from the entire site');
  });

  it('should detect when Googlebot is blocked from the root', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: true,
      sitemaps: ['https://example.com/sitemap.xml'],
      rules: [
        {
          userAgent: 'Googlebot',
          rules: [{ type: 'disallow', path: '/' }],
        },
      ],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).toContain('WARNING: Googlebot is blocked from the entire site');
  });

  it('should warn if no sitemap is declared', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: true,
      sitemaps: [],
      rules: [
        {
          userAgent: '*',
          rules: [{ type: 'disallow', path: '/admin' }],
        },
      ],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).toContain('No sitemap declared in robots.txt');
  });

  it('should warn about high crawl delay', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: true,
      sitemaps: ['https://example.com/sitemap.xml'],
      rules: [
        {
          userAgent: '*',
          rules: [],
          crawlDelay: 12,
        },
      ],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).toContain('High crawl-delay (12s) for * may slow indexing');
  });

  it('should warn when blocking CSS or JS files', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: true,
      sitemaps: ['https://example.com/sitemap.xml'],
      rules: [
        {
          userAgent: '*',
          rules: [
            { type: 'disallow', path: '/assets/js/' },
            { type: 'disallow', path: '/styles/main.css' },
          ],
        },
      ],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).toContain('Blocking CSS/JS (/assets/js/) may hurt rendering');
    expect(issues).toContain('Blocking CSS/JS (/styles/main.css) may hurt rendering');
  });

  it('should warn when blocking image directories', () => {
    const mockResult: RobotsResult = {
      url: 'https://example.com/robots.txt',
      exists: true,
      sitemaps: ['https://example.com/sitemap.xml'],
      rules: [
        {
          userAgent: '*',
          rules: [
            { type: 'disallow', path: '/images/' },
          ],
        },
      ],
      issues: [],
    };

    const issues = analyzeRobots(mockResult);
    expect(issues).toContain('Blocking images (/images/) may hurt image search visibility');
  });
});
