import { Command } from 'commander';
import chalk from 'chalk';
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
