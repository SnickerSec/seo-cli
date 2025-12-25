import { Command } from 'commander';
import chalk from 'chalk';
import { formatTable, error, info, success } from '../lib/formatter.js';
import { getPageSpeedApiKey, setPageSpeedApiKey } from '../lib/auth.js';
import type { CoreWebVitals } from '../types/index.js';

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface LighthouseAudit {
  score: number | null;
  numericValue?: number;
  displayValue?: string;
}

interface PageSpeedResponse {
  lighthouseResult: {
    categories: {
      performance: { score: number };
      accessibility?: { score: number };
      'best-practices'?: { score: number };
      seo?: { score: number };
    };
    audits: {
      'largest-contentful-paint': LighthouseAudit;
      'first-contentful-paint': LighthouseAudit;
      'cumulative-layout-shift': LighthouseAudit;
      'total-blocking-time': LighthouseAudit;
      'speed-index': LighthouseAudit;
      'interactive': LighthouseAudit;
      'server-response-time'?: LighthouseAudit;
      [key: string]: LighthouseAudit | undefined;
    };
  };
  loadingExperience?: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS?: { percentile: number };
      FIRST_INPUT_DELAY_MS?: { percentile: number };
      CUMULATIVE_LAYOUT_SHIFT_SCORE?: { percentile: number };
      FIRST_CONTENTFUL_PAINT_MS?: { percentile: number };
      INTERACTION_TO_NEXT_PAINT?: { percentile: number };
      EXPERIMENTAL_TIME_TO_FIRST_BYTE?: { percentile: number };
    };
  };
}

function getScoreColor(score: number): (text: string) => string {
  if (score >= 90) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCls(cls: number | null | undefined): string {
  if (cls === null || cls === undefined) return 'N/A';
  return cls.toFixed(3);
}

async function runPageSpeed(url: string, strategy: 'mobile' | 'desktop'): Promise<PageSpeedResponse> {
  const apiKey = getPageSpeedApiKey();

  // Build URL with multiple category params
  const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
  const categoryParams = categories.map(c => `category=${c}`).join('&');

  let apiUrl = `${PAGESPEED_API}?url=${encodeURIComponent(url)}&strategy=${strategy}&${categoryParams}`;

  if (apiKey) {
    apiUrl += `&key=${apiKey}`;
  }

  const response = await fetch(apiUrl);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `PageSpeed API error: ${response.status}`
    );
  }

  return response.json() as Promise<PageSpeedResponse>;
}

function extractCoreWebVitals(data: PageSpeedResponse): CoreWebVitals {
  const fieldData = data.loadingExperience?.metrics;
  const labData = data.lighthouseResult.audits;

  return {
    lcp: fieldData?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ??
         labData['largest-contentful-paint']?.numericValue ?? null,
    fid: fieldData?.FIRST_INPUT_DELAY_MS?.percentile ?? null,
    cls: fieldData?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile !== undefined
         ? fieldData.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100
         : labData['cumulative-layout-shift']?.numericValue ?? null,
    fcp: fieldData?.FIRST_CONTENTFUL_PAINT_MS?.percentile ??
         labData['first-contentful-paint']?.numericValue ?? null,
    ttfb: fieldData?.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile ??
          labData['server-response-time']?.numericValue ?? null,
    inp: fieldData?.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
  };
}

export function createSpeedCommand(): Command {
  const speed = new Command('speed')
    .description('PageSpeed Insights - analyze page performance and Core Web Vitals');

  speed
    .command('run <url>')
    .description('Run PageSpeed analysis on a URL')
    .option('-s, --strategy <strategy>', 'Analysis strategy: mobile or desktop', 'mobile')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .action(async (url, options) => {
      try {
        // Validate URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        info(`Analyzing ${url} (${options.strategy})...`);
        info('This may take 30-60 seconds...\n');

        const data = await runPageSpeed(url, options.strategy);
        const vitals = extractCoreWebVitals(data);
        const categories = data.lighthouseResult.categories;

        if (options.format === 'json') {
          console.log(JSON.stringify({
            url,
            strategy: options.strategy,
            scores: {
              performance: Math.round((categories.performance?.score || 0) * 100),
              accessibility: Math.round((categories.accessibility?.score || 0) * 100),
              bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
              seo: Math.round((categories.seo?.score || 0) * 100),
            },
            coreWebVitals: vitals,
          }, null, 2));
          return;
        }

        // Display scores
        const perfScore = Math.round((categories.performance?.score || 0) * 100);
        const accessScore = Math.round((categories.accessibility?.score || 0) * 100);
        const bpScore = Math.round((categories['best-practices']?.score || 0) * 100);
        const seoScore = Math.round((categories.seo?.score || 0) * 100);

        console.log(chalk.bold.cyan('\n📊 PageSpeed Scores\n'));

        const scoreTable = [
          ['Performance', getScoreColor(perfScore)(`${perfScore}`)],
          ['Accessibility', getScoreColor(accessScore)(`${accessScore}`)],
          ['Best Practices', getScoreColor(bpScore)(`${bpScore}`)],
          ['SEO', getScoreColor(seoScore)(`${seoScore}`)],
        ];
        console.log(formatTable(['Category', 'Score'], scoreTable));

        // Display Core Web Vitals
        console.log(chalk.bold.cyan('\n⚡ Core Web Vitals\n'));

        const vitalsTable = [
          ['LCP (Largest Contentful Paint)', formatMs(vitals.lcp), vitals.lcp && vitals.lcp <= 2500 ? chalk.green('Good') : vitals.lcp && vitals.lcp <= 4000 ? chalk.yellow('Needs Improvement') : chalk.red('Poor')],
          ['FID (First Input Delay)', formatMs(vitals.fid), vitals.fid && vitals.fid <= 100 ? chalk.green('Good') : vitals.fid && vitals.fid <= 300 ? chalk.yellow('Needs Improvement') : vitals.fid ? chalk.red('Poor') : 'N/A'],
          ['CLS (Cumulative Layout Shift)', formatCls(vitals.cls), vitals.cls !== null && vitals.cls <= 0.1 ? chalk.green('Good') : vitals.cls !== null && vitals.cls <= 0.25 ? chalk.yellow('Needs Improvement') : vitals.cls !== null ? chalk.red('Poor') : 'N/A'],
          ['FCP (First Contentful Paint)', formatMs(vitals.fcp), vitals.fcp && vitals.fcp <= 1800 ? chalk.green('Good') : vitals.fcp && vitals.fcp <= 3000 ? chalk.yellow('Needs Improvement') : chalk.red('Poor')],
          ['TTFB (Time to First Byte)', formatMs(vitals.ttfb), vitals.ttfb && vitals.ttfb <= 800 ? chalk.green('Good') : vitals.ttfb && vitals.ttfb <= 1800 ? chalk.yellow('Needs Improvement') : vitals.ttfb ? chalk.red('Poor') : 'N/A'],
          ['INP (Interaction to Next Paint)', formatMs(vitals.inp), vitals.inp && vitals.inp <= 200 ? chalk.green('Good') : vitals.inp && vitals.inp <= 500 ? chalk.yellow('Needs Improvement') : vitals.inp ? chalk.red('Poor') : 'N/A'],
        ];
        console.log(formatTable(['Metric', 'Value', 'Rating'], vitalsTable));

        // Legend
        console.log(chalk.dim('\nRating thresholds based on Google\'s Core Web Vitals standards.'));
        console.log(chalk.dim(`${chalk.green('●')} Good  ${chalk.yellow('●')} Needs Improvement  ${chalk.red('●')} Poor\n`));

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to run PageSpeed analysis');
        process.exit(1);
      }
    });

  speed
    .command('auth')
    .description('Set PageSpeed API key (optional, for higher quota)')
    .requiredOption('-k, --api-key <key>', 'Google API key')
    .action((options) => {
      try {
        setPageSpeedApiKey(options.apiKey);
        success('PageSpeed API key saved');
        info('API key is optional but increases rate limits.');
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to save API key');
        process.exit(1);
      }
    });

  return speed;
}
