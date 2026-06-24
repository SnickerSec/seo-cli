import { Command } from 'commander';
import chalk from 'chalk';
import { SiteCrawler } from '../lib/crawler.js';
import { formatOutput, formatTable, error, info, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';

interface SitemapEntry {
  url: string;
}

async function fetchSitemapUrls(sitemapUrl: string, visited: Set<string> = new Set()): Promise<SitemapEntry[]> {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  const response = await fetch(sitemapUrl, {
    headers: { 'User-Agent': 'SEO-CLI-InternalLinks/1.0' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap (${response.status}): ${sitemapUrl}`);
  }
  const xml = await response.text();

  // Sitemap index → recurse
  if (/<sitemapindex/i.test(xml)) {
    const nested: SitemapEntry[] = [];
    const matches = xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi);
    for (const m of matches) {
      const child = m[1].trim();
      try {
        const childEntries = await fetchSitemapUrls(child, visited);
        nested.push(...childEntries);
      } catch (e) {
        // non-fatal — note and continue
        warn(`Could not fetch nested sitemap: ${child} (${e instanceof Error ? e.message : 'error'})`);
      }
    }
    return nested;
  }

  const entries: SitemapEntry[] = [];
  const urlMatches = xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi);
  for (const m of urlMatches) {
    entries.push({ url: m[1].trim() });
  }
  return entries;
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    let s = u.href;
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

export function createInternalLinksCommand(): Command {
  return new Command('internal-links')
    .description('Analyze internal link graph, find orphan pages, and low-linked pages')
    .argument('<url>', 'Start URL to crawl from')
    .option('-d, --depth <n>', 'Max crawl depth', '3')
    .option('-l, --limit <n>', 'Max pages to crawl', '200')
    .option('-c, --concurrency <n>', 'Concurrent requests', '5')
    .option('--sitemap <url>', 'Sitemap URL for true orphan detection (pages in sitemap but not linked)')
    .option('--top <n>', 'Show top N most-linked and least-linked pages', '10')
    .option('-f, --format <format>', 'Output format: table, json, csv', 'table')
    .action(async (startUrl: string, options) => {
      try {
        const validation = validateUrl(startUrl);
        if (!validation.valid) {
          error(`Invalid URL: ${startUrl} - ${validation.error}`);
          process.exit(1);
        }
        const root = validation.url!;
        const host = new URL(root).hostname;

        info(`Crawling ${root} (depth=${options.depth}, limit=${options.limit})...`);
        const crawler = new SiteCrawler(root, {
          maxDepth: parseInt(options.depth, 10),
          maxPages: parseInt(options.limit, 10),
          concurrency: parseInt(options.concurrency, 10),
          requestsPerSecond: 10,
          onProgress: (crawled, queued) => {
            process.stdout.write(`\r  Crawled: ${crawled}, queued: ${queued}   `);
          },
        });
        const results = await crawler.crawl();
        process.stdout.write('\n');
        info(`Crawled ${results.length} pages.`);

        // Build inbound link map
        const crawledUrls = new Set(results.map((r) => normalize(r.url)));
        const inbound = new Map<string, Set<string>>();
        for (const url of crawledUrls) inbound.set(url, new Set());

        for (const page of results) {
          const from = normalize(page.url);
          for (const link of page.links) {
            try {
              const target = normalize(new URL(link, page.url).href);
              if (new URL(target).hostname !== host) continue;
              if (target === from) continue;
              const set = inbound.get(target);
              if (set) set.add(from);
            } catch { /* skip */ }
          }
        }

        const inboundCounts = Array.from(inbound.entries()).map(([url, froms]) => ({
          url,
          inboundCount: froms.size,
        }));

        // Orphans detected via crawl: pages discovered but with 0 inbound links (excluding the root itself).
        const rootNorm = normalize(root);
        const crawlOrphans = inboundCounts.filter((p) => p.url !== rootNorm && p.inboundCount === 0);

        // Sitemap-based orphan detection
        let sitemapOrphans: string[] = [];
        let sitemapPageCount: number | null = null;
        if (options.sitemap) {
          info(`Fetching sitemap: ${options.sitemap}`);
          const entries = await fetchSitemapUrls(options.sitemap);
          const sitemapUrls = new Set(entries.map((e) => normalize(e.url)).filter((u) => {
            try { return new URL(u).hostname === host; } catch { return false; }
          }));
          sitemapPageCount = sitemapUrls.size;
          info(`Sitemap lists ${sitemapUrls.size} on-host URLs.`);
          for (const u of sitemapUrls) {
            if (!crawledUrls.has(u)) sitemapOrphans.push(u);
          }
        }

        if (options.format === 'json') {
          console.log(JSON.stringify({
            root,
            pagesCrawled: results.length,
            sitemapPageCount,
            inbound: inboundCounts,
            crawlOrphans,
            sitemapOrphans,
          }, null, 2));
          return;
        }

        const top = parseInt(options.top, 10);
        const sorted = [...inboundCounts].sort((a, b) => b.inboundCount - a.inboundCount);

        console.log(chalk.bold.cyan('\n🔗 Internal Link Analysis\n'));
        console.log(formatTable(['Metric', 'Value'], [
          ['Pages crawled', results.length],
          ['Pages with inbound links', inboundCounts.filter((p) => p.inboundCount > 0).length],
          ['Crawl orphans (0 inbound)', crawlOrphans.length],
          ...(sitemapPageCount !== null ? [
            ['Sitemap URLs', sitemapPageCount] as (string | number)[],
            ['Sitemap orphans (not reached by crawl)', sitemapOrphans.length] as (string | number)[],
          ] : []),
        ]));

        console.log(chalk.bold(`\nTop ${Math.min(top, sorted.length)} Most-Linked Pages:`));
        console.log(formatOutput(
          ['Inbound', 'URL'],
          sorted.slice(0, top).map((p) => [p.inboundCount, p.url]),
          'table'
        ));

        if (crawlOrphans.length) {
          console.log(chalk.bold.yellow(`\n⚠ Pages with 0 Inbound Internal Links (${crawlOrphans.length}):`));
          console.log(formatOutput(
            ['URL'],
            crawlOrphans.slice(0, top).map((p) => [p.url]),
            'table'
          ));
          if (crawlOrphans.length > top) {
            console.log(chalk.dim(`  ...and ${crawlOrphans.length - top} more.`));
          }
        }

        if (sitemapOrphans.length) {
          console.log(chalk.bold.red(`\n🚨 Sitemap Orphans — in sitemap but not linked from any crawled page (${sitemapOrphans.length}):`));
          console.log(formatOutput(
            ['URL'],
            sitemapOrphans.slice(0, top).map((u) => [u]),
            'table'
          ));
          if (sitemapOrphans.length > top) {
            console.log(chalk.dim(`  ...and ${sitemapOrphans.length - top} more.`));
          }
        }
        console.log();
      } catch (e) {
        error(e instanceof Error ? e.message : 'internal-links analysis failed');
        process.exit(1);
      }
    });
}
