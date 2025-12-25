import { Command } from 'commander';
import chalk from 'chalk';
import { SiteCrawler } from '../lib/crawler.js';
import { formatTable, error, info, success, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import { withCache } from '../lib/cache.js';
import { getPageSpeedApiKey } from '../lib/auth.js';
import type { CrawlSummary, CoreWebVitals } from '../types/index.js';

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface PageSpeedResult {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  vitals: CoreWebVitals;
}

async function runPageSpeed(url: string): Promise<PageSpeedResult> {
  const apiKey = getPageSpeedApiKey();
  const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
  const categoryParams = categories.map(c => `category=${c}`).join('&');

  let apiUrl = `${PAGESPEED_API}?url=${encodeURIComponent(url)}&strategy=mobile&${categoryParams}`;
  if (apiKey) {
    apiUrl += `&key=${apiKey}`;
  }

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`PageSpeed API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const cats = data.lighthouseResult.categories;
  const audits = data.lighthouseResult.audits;

  return {
    performance: Math.round((cats.performance?.score || 0) * 100),
    accessibility: Math.round((cats.accessibility?.score || 0) * 100),
    bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
    seo: Math.round((cats.seo?.score || 0) * 100),
    vitals: {
      lcp: audits['largest-contentful-paint']?.numericValue ?? null,
      fid: null,
      cls: audits['cumulative-layout-shift']?.numericValue ?? null,
      fcp: audits['first-contentful-paint']?.numericValue ?? null,
      ttfb: audits['server-response-time']?.numericValue ?? null,
      inp: null,
    },
  };
}

function getScoreColor(score: number): (text: string) => string {
  if (score >= 90) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function formatMs(ms: number | null): string {
  if (ms === null) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function calculateOverallScore(crawlSummary: CrawlSummary, pageSpeed: PageSpeedResult | null): number {
  let score = 100;

  // Deduct for crawl issues
  const totalPages = crawlSummary.totalPages || 1;
  score -= (crawlSummary.brokenLinks.length / totalPages) * 20;
  score -= (crawlSummary.missingTitles.length / totalPages) * 10;
  score -= (crawlSummary.missingMetaDescriptions.length / totalPages) * 10;
  score -= (crawlSummary.missingH1s.length / totalPages) * 5;
  score -= (crawlSummary.duplicateTitles.length / totalPages) * 5;
  score -= Math.min(crawlSummary.missingAltText.length, 10) * 0.5;

  // Factor in PageSpeed scores
  if (pageSpeed) {
    const psAvg = (pageSpeed.performance + pageSpeed.seo) / 2;
    score = (score * 0.6) + (psAvg * 0.4);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function createAuditCommand(): Command {
  const audit = new Command('audit')
    .description('Run a comprehensive SEO audit (crawl + PageSpeed)')
    .argument('<url>', 'URL to audit')
    .option('-d, --depth <number>', 'Maximum crawl depth', '2')
    .option('-l, --limit <number>', 'Maximum pages to crawl', '50')
    .option('--skip-speed', 'Skip PageSpeed analysis')
    .option('--no-cache', 'Bypass cache for PageSpeed')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .action(async (url, options) => {
      try {
        const validation = validateUrl(url);
        if (!validation.valid) {
          error(`Invalid URL: ${validation.error}`);
          process.exit(1);
        }
        url = validation.url!;

        console.log(chalk.bold.cyan('\n🔍 SEO Audit\n'));
        info(`Target: ${url}`);
        info(`Crawl depth: ${options.depth}, Max pages: ${options.limit}\n`);

        // Phase 1: Crawl
        console.log(chalk.bold('Phase 1: Site Crawl'));
        let lastUpdate = Date.now();
        const crawler = new SiteCrawler(url, {
          maxDepth: parseInt(options.depth, 10),
          maxPages: parseInt(options.limit, 10),
          concurrency: 5,
          requestsPerSecond: 10,
          onProgress: (crawled, queued) => {
            const now = Date.now();
            if (now - lastUpdate > 1000) {
              process.stdout.write(`\r  Crawled: ${crawled} | Queued: ${queued}    `);
              lastUpdate = now;
            }
          },
        });

        const crawlResults = await crawler.crawl();
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        success(`Crawled ${crawlResults.length} pages\n`);

        const crawlSummary = crawler.generateSummary(crawlResults);

        // Phase 2: PageSpeed
        let pageSpeed: PageSpeedResult | null = null;
        if (!options.skipSpeed) {
          console.log(chalk.bold('Phase 2: PageSpeed Analysis'));
          info('Analyzing homepage performance...');

          try {
            pageSpeed = await withCache(
              'pagespeed',
              `${url}:mobile`,
              () => runPageSpeed(url),
              { bypass: !options.cache }
            );
            success('PageSpeed analysis complete\n');
          } catch (e) {
            warn(`PageSpeed analysis failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
            info('Continuing with crawl results only\n');
          }
        }

        // Output results
        if (options.format === 'json') {
          const report = {
            url,
            timestamp: new Date().toISOString(),
            overallScore: calculateOverallScore(crawlSummary, pageSpeed),
            crawl: {
              totalPages: crawlSummary.totalPages,
              issues: {
                brokenLinks: crawlSummary.brokenLinks.length,
                missingTitles: crawlSummary.missingTitles.length,
                missingMetaDescriptions: crawlSummary.missingMetaDescriptions.length,
                missingH1s: crawlSummary.missingH1s.length,
                missingAltText: crawlSummary.missingAltText.length,
                duplicateTitles: crawlSummary.duplicateTitles.length,
              },
              details: crawlSummary,
            },
            pageSpeed: pageSpeed ? {
              scores: {
                performance: pageSpeed.performance,
                accessibility: pageSpeed.accessibility,
                bestPractices: pageSpeed.bestPractices,
                seo: pageSpeed.seo,
              },
              coreWebVitals: pageSpeed.vitals,
            } : null,
          };
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        // Display summary
        console.log(chalk.bold.cyan('📊 Audit Results\n'));

        // Overall score
        const overallScore = calculateOverallScore(crawlSummary, pageSpeed);
        const scoreColor = getScoreColor(overallScore);
        console.log(chalk.bold('Overall SEO Score: ') + chalk.bold(scoreColor(`${overallScore}/100`)) + '\n');

        // Crawl summary
        console.log(chalk.bold('Site Crawl Summary:'));
        const crawlRows = [
          ['Pages Crawled', crawlSummary.totalPages.toString()],
          ['Broken Links', crawlSummary.brokenLinks.length === 0 ? chalk.green('0') : chalk.red(crawlSummary.brokenLinks.length.toString())],
          ['Missing Titles', crawlSummary.missingTitles.length === 0 ? chalk.green('0') : chalk.yellow(crawlSummary.missingTitles.length.toString())],
          ['Missing Meta Descriptions', crawlSummary.missingMetaDescriptions.length === 0 ? chalk.green('0') : chalk.yellow(crawlSummary.missingMetaDescriptions.length.toString())],
          ['Missing H1 Tags', crawlSummary.missingH1s.length === 0 ? chalk.green('0') : chalk.yellow(crawlSummary.missingH1s.length.toString())],
          ['Duplicate Titles', crawlSummary.duplicateTitles.length === 0 ? chalk.green('0') : chalk.yellow(crawlSummary.duplicateTitles.length.toString())],
          ['Images Missing Alt', crawlSummary.missingAltText.length === 0 ? chalk.green('0') : chalk.yellow(crawlSummary.missingAltText.length.toString())],
        ];
        console.log(formatTable(['Metric', 'Count'], crawlRows));

        // PageSpeed scores
        if (pageSpeed) {
          console.log(chalk.bold('\nPageSpeed Scores (Mobile):'));
          const psRows = [
            ['Performance', getScoreColor(pageSpeed.performance)(`${pageSpeed.performance}`)],
            ['Accessibility', getScoreColor(pageSpeed.accessibility)(`${pageSpeed.accessibility}`)],
            ['Best Practices', getScoreColor(pageSpeed.bestPractices)(`${pageSpeed.bestPractices}`)],
            ['SEO', getScoreColor(pageSpeed.seo)(`${pageSpeed.seo}`)],
          ];
          console.log(formatTable(['Category', 'Score'], psRows));

          console.log(chalk.bold('\nCore Web Vitals:'));
          const vitalsRows = [
            ['LCP', formatMs(pageSpeed.vitals.lcp), pageSpeed.vitals.lcp && pageSpeed.vitals.lcp <= 2500 ? chalk.green('Good') : chalk.red('Needs Work')],
            ['FCP', formatMs(pageSpeed.vitals.fcp), pageSpeed.vitals.fcp && pageSpeed.vitals.fcp <= 1800 ? chalk.green('Good') : chalk.red('Needs Work')],
            ['CLS', pageSpeed.vitals.cls?.toFixed(3) ?? 'N/A', pageSpeed.vitals.cls !== null && pageSpeed.vitals.cls <= 0.1 ? chalk.green('Good') : chalk.red('Needs Work')],
            ['TTFB', formatMs(pageSpeed.vitals.ttfb), pageSpeed.vitals.ttfb && pageSpeed.vitals.ttfb <= 800 ? chalk.green('Good') : chalk.red('Needs Work')],
          ];
          console.log(formatTable(['Metric', 'Value', 'Status'], vitalsRows));
        }

        // Top issues
        const issues: string[] = [];
        if (crawlSummary.brokenLinks.length > 0) {
          issues.push(`Fix ${crawlSummary.brokenLinks.length} broken link(s)`);
        }
        if (crawlSummary.missingTitles.length > 0) {
          issues.push(`Add title tags to ${crawlSummary.missingTitles.length} page(s)`);
        }
        if (crawlSummary.missingMetaDescriptions.length > 0) {
          issues.push(`Add meta descriptions to ${crawlSummary.missingMetaDescriptions.length} page(s)`);
        }
        if (pageSpeed && pageSpeed.performance < 50) {
          issues.push('Improve page performance (score below 50)');
        }
        if (pageSpeed && pageSpeed.vitals.lcp && pageSpeed.vitals.lcp > 2500) {
          issues.push(`Optimize LCP (currently ${formatMs(pageSpeed.vitals.lcp)})`);
        }

        if (issues.length > 0) {
          console.log(chalk.bold('\n🔧 Priority Actions:'));
          issues.slice(0, 5).forEach((issue, i) => {
            console.log(chalk.yellow(`  ${i + 1}. ${issue}`));
          });
        } else {
          console.log(chalk.green('\n✓ No critical issues found!'));
        }

        console.log('');

      } catch (e) {
        error(e instanceof Error ? e.message : 'Audit failed');
        process.exit(1);
      }
    });

  return audit;
}
