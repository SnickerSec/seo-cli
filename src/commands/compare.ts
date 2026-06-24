import { Command } from 'commander';
import chalk from 'chalk';
import * as cheerio from 'cheerio';
import { SiteCrawler } from '../lib/crawler.js';
import { formatTable, error, info, success, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import { withCache } from '../lib/cache.js';
import { getPageSpeedApiKey, getMozCredentials } from '../lib/auth.js';

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const MOZ_API = 'https://lsapi.seomoz.com/v2';

interface SiteMetrics {
  url: string;
  domain: string;
  pageSpeed: {
    performance: number;
    seo: number;
    accessibility: number;
    bestPractices: number;
  } | null;
  crawl: {
    pages: number;
    brokenLinks: number;
    missingTitles: number;
    missingMeta: number;
  } | null;
  moz: {
    da: number;
    pa: number;
    spamScore: number;
    linkingDomains: number;
  } | null;
}

async function getPageSpeedMetrics(url: string, useCache: boolean): Promise<SiteMetrics['pageSpeed']> {
  const apiKey = getPageSpeedApiKey();
  const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
  const categoryParams = categories.map(c => `category=${c}`).join('&');

  let apiUrl = `${PAGESPEED_API}?url=${encodeURIComponent(url)}&strategy=mobile&${categoryParams}`;
  if (apiKey) {
    apiUrl += `&key=${apiKey}`;
  }

  try {
    const data = await withCache(
      'pagespeed',
      `${url}:mobile`,
      async () => {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`PageSpeed error: ${response.status}`);
        return response.json();
      },
      { bypass: !useCache }
    ) as any;

    const cats = data.lighthouseResult?.categories;
    return {
      performance: Math.round((cats?.performance?.score || 0) * 100),
      seo: Math.round((cats?.seo?.score || 0) * 100),
      accessibility: Math.round((cats?.accessibility?.score || 0) * 100),
      bestPractices: Math.round((cats?.['best-practices']?.score || 0) * 100),
    };
  } catch {
    return null;
  }
}

async function getCrawlMetrics(url: string): Promise<SiteMetrics['crawl']> {
  try {
    const crawler = new SiteCrawler(url, {
      maxDepth: 1,
      maxPages: 20,
      concurrency: 5,
      requestsPerSecond: 10,
    });

    const results = await crawler.crawl();
    const summary = crawler.generateSummary(results);

    return {
      pages: summary.totalPages,
      brokenLinks: summary.brokenLinks.length,
      missingTitles: summary.missingTitles.length,
      missingMeta: summary.missingMetaDescriptions.length,
    };
  } catch {
    return null;
  }
}

async function getMozMetrics(url: string, useCache: boolean): Promise<SiteMetrics['moz']> {
  const creds = getMozCredentials();
  if (!creds.accessId || !creds.secretKey) {
    return null;
  }

  try {
    const data = await withCache(
      'moz',
      url,
      async () => {
        const auth = Buffer.from(`${creds.accessId}:${creds.secretKey}`).toString('base64');
        const response = await fetch(`${MOZ_API}/url_metrics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
          body: JSON.stringify({ targets: [url] }),
        });
        if (!response.ok) throw new Error(`Moz error: ${response.status}`);
        return response.json();
      },
      { bypass: !useCache }
    ) as any;

    const metrics = data.results?.[0];
    if (!metrics) return null;

    return {
      da: metrics.domain_authority || 0,
      pa: metrics.page_authority || 0,
      spamScore: metrics.spam_score || 0,
      linkingDomains: metrics.root_domains_to_root_domain || 0,
    };
  } catch {
    return null;
  }
}

function getScoreColor(score: number, inverse = false): (text: string) => string {
  if (inverse) {
    if (score <= 4) return chalk.green;
    if (score <= 7) return chalk.yellow;
    return chalk.red;
  }
  if (score >= 80) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function colorize(value: number | string, threshold: { good: number; ok: number }, inverse = false): string {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (isNaN(num)) return String(value);

  if (inverse) {
    if (num <= threshold.good) return chalk.green(String(value));
    if (num <= threshold.ok) return chalk.yellow(String(value));
    return chalk.red(String(value));
  }

  if (num >= threshold.good) return chalk.green(String(value));
  if (num >= threshold.ok) return chalk.yellow(String(value));
  return chalk.red(String(value));
}

interface PageFacts {
  url: string;
  status: number;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  h1: string | null;
  h1Count: number;
  h2Count: number;
  wordCount: number;
  canonical: string | null;
  metaRobots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  internalLinks: number;
  externalLinks: number;
  images: number;
  imagesMissingAlt: number;
  schemaTypes: string[];
  htmlBytes: number;
}

async function fetchPageFacts(url: string): Promise<PageFacts> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'SEO-CLI-PageDiff/1.0', 'Accept': 'text/html' },
    redirect: 'follow',
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  const host = new URL(url).hostname;

  const title = $('title').first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  const h1 = $('h1').first().text().trim() || null;
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const metaRobots = $('meta[name="robots"]').attr('content')?.trim() || null;
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null;
  const ogDescription = $('meta[property="og:description"]').attr('content')?.trim() || null;
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || null;

  let internal = 0;
  let external = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    try {
      const abs = new URL(href, url);
      if (abs.hostname === host) internal++;
      else external++;
    } catch { /* skip */ }
  });

  const imgs = $('img');
  const imagesMissingAlt = imgs.filter((_, el) => {
    const a = $(el).attr('alt');
    return !a || a.trim() === '';
  }).length;

  const schemaTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const collect = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(collect);
        if (node && typeof node === 'object') {
          const t = (node as Record<string, unknown>)['@type'];
          if (typeof t === 'string') schemaTypes.push(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && schemaTypes.push(x));
          if ('@graph' in (node as object)) collect((node as { '@graph': unknown })['@graph']);
        }
      };
      collect(parsed);
    } catch { /* ignore invalid JSON-LD */ }
  });

  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = text ? text.split(' ').length : 0;

  return {
    url,
    status: response.status,
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    h1,
    h1Count: $('h1').length,
    h2Count: $('h2').length,
    wordCount,
    canonical,
    metaRobots,
    ogTitle,
    ogDescription,
    ogImage,
    internalLinks: internal,
    externalLinks: external,
    images: imgs.length,
    imagesMissingAlt,
    schemaTypes: [...new Set(schemaTypes)],
    htmlBytes: html.length,
  };
}

function diffCell(a: unknown, b: unknown): string {
  if (a === b) return '—';
  if (typeof a === 'number' && typeof b === 'number') {
    const d = b - a;
    if (d > 0) return chalk.green(`+${d}`);
    if (d < 0) return chalk.red(`${d}`);
    return '—';
  }
  return chalk.yellow('≠');
}

export function createPageDiffCommand(): Command {
  return new Command('pagediff')
    .description('Side-by-side on-page SEO A/B comparison of two URLs')
    .argument('<url1>', 'First URL')
    .argument('<url2>', 'Second URL')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .action(async (url1: string, url2: string, options) => {
      try {
        const v1 = validateUrl(url1);
        const v2 = validateUrl(url2);
        if (!v1.valid || !v2.valid) {
          error(`Invalid URL: ${v1.valid ? url2 : url1}`);
          process.exit(1);
        }
        info(`Fetching both pages...`);
        const [a, b] = await Promise.all([fetchPageFacts(v1.url!), fetchPageFacts(v2.url!)]);

        if (options.format === 'json') {
          console.log(JSON.stringify({ a, b }, null, 2));
          return;
        }

        const rows: (string | number)[][] = [];
        const addText = (label: string, va: unknown, vb: unknown) => {
          const same = va === vb;
          rows.push([label, String(va ?? '-'), String(vb ?? '-'), same ? '—' : chalk.yellow('≠')]);
        };
        const addNum = (label: string, na: number, nb: number) => {
          rows.push([label, na, nb, diffCell(na, nb)]);
        };

        rows.push(['Status', a.status, b.status, diffCell(a.status, b.status)]);
        addText('Title', a.title, b.title);
        addNum('Title length', a.titleLength, b.titleLength);
        addText('Meta description', a.metaDescription, b.metaDescription);
        addNum('Meta desc length', a.metaDescriptionLength, b.metaDescriptionLength);
        addText('H1', a.h1, b.h1);
        addNum('H1 count', a.h1Count, b.h1Count);
        addNum('H2 count', a.h2Count, b.h2Count);
        addNum('Word count', a.wordCount, b.wordCount);
        addText('Canonical', a.canonical, b.canonical);
        addText('Meta robots', a.metaRobots, b.metaRobots);
        addText('og:title', a.ogTitle, b.ogTitle);
        addText('og:description', a.ogDescription, b.ogDescription);
        addText('og:image', a.ogImage, b.ogImage);
        addNum('Internal links', a.internalLinks, b.internalLinks);
        addNum('External links', a.externalLinks, b.externalLinks);
        addNum('Images', a.images, b.images);
        addNum('Images w/o alt', a.imagesMissingAlt, b.imagesMissingAlt);
        addText('Schema types', a.schemaTypes.join(', ') || '-', b.schemaTypes.join(', ') || '-');
        addNum('HTML bytes', a.htmlBytes, b.htmlBytes);

        console.log(chalk.bold.cyan('\n📄 Page A/B Diff\n'));
        console.log(chalk.dim(`A: ${a.url}`));
        console.log(chalk.dim(`B: ${b.url}\n`));
        console.log(formatTable(['Field', 'A', 'B', 'Δ'], rows));
        console.log();
      } catch (e) {
        error(e instanceof Error ? e.message : 'pagediff failed');
        process.exit(1);
      }
    });
}

export function createCompareCommand(): Command {
  const compare = new Command('compare')
    .description('Compare SEO metrics across multiple sites')
    .argument('<urls...>', 'URLs to compare (2-5 sites)')
    .option('--no-cache', 'Bypass cache for fresh data')
    .option('--skip-crawl', 'Skip crawl analysis (faster)')
    .option('--skip-speed', 'Skip PageSpeed analysis')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .action(async (urls: string[], options) => {
      try {
        if (urls.length < 2) {
          error('Please provide at least 2 URLs to compare');
          process.exit(1);
        }
        if (urls.length > 5) {
          error('Maximum 5 URLs can be compared at once');
          process.exit(1);
        }

        // Validate URLs
        const validatedUrls: string[] = [];
        for (const url of urls) {
          const validation = validateUrl(url);
          if (!validation.valid) {
            error(`Invalid URL: ${url} - ${validation.error}`);
            process.exit(1);
          }
          validatedUrls.push(validation.url!);
        }

        console.log(chalk.bold.cyan('\n🔍 SEO Comparison\n'));
        info(`Comparing ${validatedUrls.length} sites...\n`);

        const metrics: SiteMetrics[] = [];
        const mozConfigured = !!(getMozCredentials().accessId);

        for (let i = 0; i < validatedUrls.length; i++) {
          const url = validatedUrls[i];
          const domain = new URL(url).hostname;

          process.stdout.write(`  [${i + 1}/${validatedUrls.length}] Analyzing ${domain}...`);

          const siteMetrics: SiteMetrics = {
            url,
            domain,
            pageSpeed: null,
            crawl: null,
            moz: null,
          };

          // Fetch metrics in parallel where possible
          const promises: Promise<void>[] = [];

          if (!options.skipSpeed) {
            promises.push(
              getPageSpeedMetrics(url, options.cache).then(result => {
                siteMetrics.pageSpeed = result;
              })
            );
          }

          if (!options.skipCrawl) {
            promises.push(
              getCrawlMetrics(url).then(result => {
                siteMetrics.crawl = result;
              })
            );
          }

          if (mozConfigured) {
            promises.push(
              getMozMetrics(url, options.cache).then(result => {
                siteMetrics.moz = result;
              })
            );
          }

          await Promise.all(promises);
          metrics.push(siteMetrics);

          process.stdout.write(' Done\n');
        }

        console.log('');

        // Output
        if (options.format === 'json') {
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            sites: metrics,
          }, null, 2));
          return;
        }

        // Display comparison tables
        const domains = metrics.map(m => m.domain.replace('www.', ''));

        // PageSpeed comparison
        if (!options.skipSpeed && metrics.some(m => m.pageSpeed)) {
          console.log(chalk.bold('PageSpeed Scores (Mobile):'));
          const headers = ['Metric', ...domains];
          const rows = [
            ['Performance', ...metrics.map(m => m.pageSpeed ? colorize(m.pageSpeed.performance, { good: 80, ok: 50 }) : '-')],
            ['SEO', ...metrics.map(m => m.pageSpeed ? colorize(m.pageSpeed.seo, { good: 80, ok: 50 }) : '-')],
            ['Accessibility', ...metrics.map(m => m.pageSpeed ? colorize(m.pageSpeed.accessibility, { good: 80, ok: 50 }) : '-')],
            ['Best Practices', ...metrics.map(m => m.pageSpeed ? colorize(m.pageSpeed.bestPractices, { good: 80, ok: 50 }) : '-')],
          ];
          console.log(formatTable(headers, rows));
        }

        // Crawl comparison
        if (!options.skipCrawl && metrics.some(m => m.crawl)) {
          console.log(chalk.bold('Site Health:'));
          const headers = ['Metric', ...domains];
          const rows = [
            ['Pages Crawled', ...metrics.map(m => m.crawl ? String(m.crawl.pages) : '-')],
            ['Broken Links', ...metrics.map(m => m.crawl ? colorize(m.crawl.brokenLinks, { good: 0, ok: 2 }, true) : '-')],
            ['Missing Titles', ...metrics.map(m => m.crawl ? colorize(m.crawl.missingTitles, { good: 0, ok: 2 }, true) : '-')],
            ['Missing Meta Desc', ...metrics.map(m => m.crawl ? colorize(m.crawl.missingMeta, { good: 0, ok: 5 }, true) : '-')],
          ];
          console.log(formatTable(headers, rows));
        }

        // Moz comparison
        if (mozConfigured && metrics.some(m => m.moz)) {
          console.log(chalk.bold('Domain Authority (Moz):'));
          const headers = ['Metric', ...domains];
          const rows = [
            ['Domain Authority', ...metrics.map(m => m.moz ? colorize(m.moz.da, { good: 40, ok: 20 }) : '-')],
            ['Page Authority', ...metrics.map(m => m.moz ? colorize(m.moz.pa, { good: 40, ok: 20 }) : '-')],
            ['Spam Score', ...metrics.map(m => m.moz ? colorize(m.moz.spamScore + '%', { good: 4, ok: 7 }, true) : '-')],
            ['Linking Domains', ...metrics.map(m => m.moz ? m.moz.linkingDomains.toLocaleString() : '-')],
          ];
          console.log(formatTable(headers, rows));
        } else if (!mozConfigured) {
          info('Tip: Configure Moz API for domain authority comparison:');
          console.log(chalk.dim('  seo-cli moz auth --id <access-id> --secret <secret-key>\n'));
        }

        // Winner summary
        console.log(chalk.bold('Summary:'));

        if (metrics.some(m => m.pageSpeed)) {
          const bestPerf = metrics.reduce((best, m) =>
            (m.pageSpeed?.performance || 0) > (best.pageSpeed?.performance || 0) ? m : best
          );
          console.log(`  ${chalk.green('⚡')} Fastest: ${chalk.bold(bestPerf.domain)} (${bestPerf.pageSpeed?.performance}/100)`);
        }

        if (metrics.some(m => m.moz)) {
          const bestDA = metrics.reduce((best, m) =>
            (m.moz?.da || 0) > (best.moz?.da || 0) ? m : best
          );
          console.log(`  ${chalk.green('🏆')} Highest DA: ${chalk.bold(bestDA.domain)} (${bestDA.moz?.da})`);
        }

        if (metrics.some(m => m.crawl)) {
          const cleanest = metrics.reduce((best, m) => {
            const issues = (m.crawl?.brokenLinks || 0) + (m.crawl?.missingTitles || 0);
            const bestIssues = (best.crawl?.brokenLinks || 0) + (best.crawl?.missingTitles || 0);
            return issues < bestIssues ? m : best;
          });
          const issues = (cleanest.crawl?.brokenLinks || 0) + (cleanest.crawl?.missingTitles || 0);
          console.log(`  ${chalk.green('✓')} Cleanest: ${chalk.bold(cleanest.domain)} (${issues} issues)`);
        }

        console.log('');

      } catch (e) {
        error(e instanceof Error ? e.message : 'Comparison failed');
        process.exit(1);
      }
    });

  return compare;
}
