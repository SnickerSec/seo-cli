import { describe, it, expect } from 'vitest';
import { parseXml, analyzeSitemap } from './sitemap.js';
import type { SitemapResult } from './sitemap.js';

describe('sitemap XML parser', () => {
  it('should parse a standard urlset sitemap', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-06-22</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;

    const { type, urls, sitemaps } = parseXml(content);

    expect(type).toBe('sitemap');
    expect(sitemaps).toHaveLength(0);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toEqual({
      loc: 'https://example.com/',
      lastmod: '2026-06-22',
      changefreq: 'daily',
      priority: '1.0',
    });
    expect(urls[1]).toEqual({
      loc: 'https://example.com/about',
      lastmod: undefined,
      changefreq: 'monthly',
      priority: '0.8',
    });
  });

  it('should parse a standard sitemap index', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-posts.xml</loc>
    <lastmod>2026-06-22T08:00:00Z</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-pages.xml</loc>
  </sitemap>
</sitemapindex>`;

    const { type, urls, sitemaps } = parseXml(content);

    expect(type).toBe('sitemapindex');
    expect(urls).toHaveLength(0);
    expect(sitemaps).toHaveLength(2);
    expect(sitemaps[0]).toEqual({
      loc: 'https://example.com/sitemap-posts.xml',
      lastmod: '2026-06-22T08:00:00Z',
    });
    expect(sitemaps[1]).toEqual({
      loc: 'https://example.com/sitemap-pages.xml',
      lastmod: undefined,
    });
  });

  it('should parse XML with namespace prefixes', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<ns:urlset xmlns:ns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <ns:url>
    <ns:loc>https://example.com/ns</ns:loc>
    <ns:priority>0.5</ns:priority>
  </ns:url>
</ns:urlset>`;

    const { type, urls } = parseXml(content);

    expect(type).toBe('sitemap');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toEqual({
      loc: 'https://example.com/ns',
      lastmod: undefined,
      changefreq: undefined,
      priority: '0.5',
    });
  });

  it('should parse elements with attributes', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url mobile="true" importance="high">
    <loc type="canonical">https://example.com/attr</loc>
    <priority>0.9</priority>
  </url>
</urlset>`;

    const { type, urls } = parseXml(content);

    expect(type).toBe('sitemap');
    expect(urls).toHaveLength(1);
    expect(urls[0].loc).toBe('https://example.com/attr');
    expect(urls[0].priority).toBe('0.9');
  });

  it('should parse elements inside CDATA blocks', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url>
    <loc><![CDATA[https://example.com/cdata?p1=1&p2=2]]></loc>
  </url>
</urlset>`;

    const { type, urls } = parseXml(content);

    expect(type).toBe('sitemap');
    expect(urls).toHaveLength(1);
    expect(urls[0].loc).toBe('https://example.com/cdata?p1=1&p2=2');
  });

  it('should handle invalid or empty XML content without crashing', () => {
    const { type, urls, sitemaps } = parseXml('not xml at all');
    expect(type).toBe('unknown');
    expect(urls).toHaveLength(0);
    expect(sitemaps).toHaveLength(0);
  });
});

describe('sitemap analyzer', () => {
  it('should flag sitemap as missing when exists is false', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'unknown',
      exists: false,
      urlCount: 0,
      urls: [],
      sitemaps: [],
      issues: [],
      validUrls: 0,
      invalidUrls: [],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('Sitemap not found or inaccessible');
  });

  it('should flag sitemap as unknown when type is unknown', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'unknown',
      exists: true,
      urlCount: 0,
      urls: [],
      sitemaps: [],
      issues: [],
      validUrls: 0,
      invalidUrls: [],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('File does not appear to be a valid sitemap (missing urlset or sitemapindex)');
  });

  it('should flag empty sitemaps', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'sitemap',
      exists: true,
      urlCount: 0,
      urls: [],
      sitemaps: [],
      issues: [],
      validUrls: 0,
      invalidUrls: [],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('Sitemap contains no URLs');
  });

  it('should warn when URL count exceeds 50,000 limit', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'sitemap',
      exists: true,
      urlCount: 50005,
      urls: new Array(50005).fill({ loc: 'https://example.com' }),
      sitemaps: [],
      issues: [],
      validUrls: 50005,
      invalidUrls: [],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('Sitemap exceeds 50,000 URL limit (50005 URLs)');
  });

  it('should check for missing lastmod', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'sitemap',
      exists: true,
      urlCount: 3,
      urls: [
        { loc: 'https://example.com/1', lastmod: '2026-06-22' },
        { loc: 'https://example.com/2' },
        { loc: 'https://example.com/3' },
      ],
      sitemaps: [],
      issues: [],
      validUrls: 3,
      invalidUrls: [],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('2 URLs missing lastmod date');
  });

  it('should check for old lastmod dates (> 1 year)', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'sitemap',
      exists: true,
      urlCount: 2,
      urls: [
        { loc: 'https://example.com/1', lastmod: '2020-01-01' },
        { loc: 'https://example.com/2', lastmod: '2021-01-01' },
      ],
      sitemaps: [],
      issues: [],
      validUrls: 2,
      invalidUrls: [],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('2 URLs have lastmod older than 1 year');
  });

  it('should check for invalid priority values', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'sitemap',
      exists: true,
      urlCount: 3,
      urls: [
        { loc: 'https://example.com/1', priority: '1.5' },
        { loc: 'https://example.com/2', priority: '-0.1' },
        { loc: 'https://example.com/3', priority: 'abc' },
      ],
      sitemaps: [],
      issues: [],
      validUrls: 3,
      invalidUrls: [],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('3 URLs have invalid priority (should be 0.0-1.0)');
  });

  it('should check for invalid changefreq values', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'sitemap',
      exists: true,
      urlCount: 2,
      urls: [
        { loc: 'https://example.com/1', changefreq: 'sometimes' },
        { loc: 'https://example.com/2', changefreq: 'daily' },
      ],
      sitemaps: [],
      issues: [],
      validUrls: 2,
      invalidUrls: [],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('1 URLs have invalid changefreq');
  });

  it('should check for invalid URLs', () => {
    const mockResult: SitemapResult = {
      url: 'https://example.com/sitemap.xml',
      type: 'sitemap',
      exists: true,
      urlCount: 2,
      urls: [
        { loc: 'https://example.com/' },
        { loc: 'not-a-url' },
      ],
      sitemaps: [],
      issues: [],
      validUrls: 1,
      invalidUrls: ['not-a-url'],
    };

    const issues = analyzeSitemap(mockResult);
    expect(issues).toContain('1 invalid URLs found');
  });
});
