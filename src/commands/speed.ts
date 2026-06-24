import { Command } from 'commander';
import chalk from 'chalk';
import { formatTable, error, info, success } from '../lib/formatter.js';
import { getPageSpeedApiKey, setPageSpeedApiKey } from '../lib/auth.js';
import { withCache } from '../lib/cache.js';
import type { CoreWebVitals } from '../types/index.js';

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CRUX_API = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

interface CruxMetricBucket {
  start: number | string;
  end?: number | string;
  density: number;
}
interface CruxMetric {
  histogram?: CruxMetricBucket[];
  percentiles?: { p75?: number };
}
interface CruxResponse {
  record?: {
    key: { url?: string; origin?: string; formFactor?: string };
    metrics: Record<string, CruxMetric>;
    collectionPeriod?: {
      firstDate: { year: number; month: number; day: number };
      lastDate: { year: number; month: number; day: number };
    };
  };
}

async function runCrux(params: { url?: string; origin?: string; formFactor?: 'PHONE' | 'DESKTOP' | 'TABLET' }): Promise<CruxResponse> {
  const apiKey = getPageSpeedApiKey();
  if (!apiKey) {
    throw new Error('CrUX requires an API key. Configure with: seo-cli speed auth --api-key <google-api-key>');
  }
  const body: Record<string, unknown> = {};
  if (params.url) body.url = params.url;
  if (params.origin) body.origin = params.origin;
  if (params.formFactor) body.formFactor = params.formFactor;

  const response = await fetch(`${CRUX_API}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = (errorData as { error?: { message?: string } }).error?.message || `CrUX API error: ${response.status}`;
    if (response.status === 404) {
      throw new Error(`${msg}\nHint: this URL/origin may not have enough real-user data in the CrUX dataset.`);
    }
    throw new Error(msg);
  }
  return response.json() as Promise<CruxResponse>;
}

function formatCruxDate(d?: { year: number; month: number; day: number }): string {
  if (!d) return 'unknown';
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function rateCrux(metric: string, p75: number | undefined): string {
  if (p75 === undefined) return 'N/A';
  const thresholds: Record<string, [number, number]> = {
    largest_contentful_paint: [2500, 4000],
    first_contentful_paint: [1800, 3000],
    cumulative_layout_shift: [0.1, 0.25],
    interaction_to_next_paint: [200, 500],
    experimental_time_to_first_byte: [800, 1800],
    first_input_delay: [100, 300],
  };
  const t = thresholds[metric];
  if (!t) return '-';
  if (p75 <= t[0]) return chalk.green('Good');
  if (p75 <= t[1]) return chalk.yellow('Needs Improvement');
  return chalk.red('Poor');
}

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
    .option('--no-cache', 'Bypass cache and fetch fresh data')
    .action(async (url, options) => {
      try {
        // Validate URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        info(`Analyzing ${url} (${options.strategy})...`);
        if (options.cache) {
          info('Using cache if available (use --no-cache to bypass)');
        }
        info('This may take 30-60 seconds for fresh analysis...\n');

        const cacheKey = `${url}:${options.strategy}`;
        const data = await withCache(
          'pagespeed',
          cacheKey,
          () => runPageSpeed(url, options.strategy),
          { bypass: !options.cache }
        );
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
    .command('crux <urlOrOrigin>')
    .description('Fetch real-user CrUX field data (Chrome UX Report)')
    .option('--origin', 'Query origin-level data instead of URL-level')
    .option('--form-factor <factor>', 'PHONE, DESKTOP, or TABLET (default: all)')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .action(async (target, options) => {
      try {
        if (!target.startsWith('http://') && !target.startsWith('https://')) {
          target = 'https://' + target;
        }
        const params: Parameters<typeof runCrux>[0] = {};
        if (options.origin) {
          const u = new URL(target);
          params.origin = `${u.protocol}//${u.host}`;
        } else {
          params.url = target;
        }
        if (options.formFactor) {
          const ff = options.formFactor.toUpperCase();
          if (!['PHONE', 'DESKTOP', 'TABLET'].includes(ff)) {
            error('--form-factor must be PHONE, DESKTOP, or TABLET');
            process.exit(1);
          }
          params.formFactor = ff as 'PHONE' | 'DESKTOP' | 'TABLET';
        }

        info(`Querying CrUX for ${params.origin || params.url}${params.formFactor ? ` (${params.formFactor})` : ''}...`);
        const data = await runCrux(params);
        const record = data.record;
        if (!record) {
          info('No CrUX data available for this target.');
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const period = record.collectionPeriod;
        console.log(chalk.bold.cyan('\n📈 CrUX Field Data (real-user p75)\n'));
        console.log(chalk.dim(`Period: ${formatCruxDate(period?.firstDate)} → ${formatCruxDate(period?.lastDate)}`));
        console.log(chalk.dim(`Key: ${JSON.stringify(record.key)}\n`));

        const rows: (string | number)[][] = [];
        for (const [metric, value] of Object.entries(record.metrics)) {
          const p75 = value.percentiles?.p75;
          let display = 'N/A';
          if (p75 !== undefined) {
            display = metric === 'cumulative_layout_shift' ? Number(p75).toFixed(3) : formatMs(Number(p75));
          }
          rows.push([metric, display, rateCrux(metric, p75 !== undefined ? Number(p75) : undefined)]);
        }
        console.log(formatTable(['Metric', 'p75', 'Rating'], rows));
        console.log();
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to query CrUX');
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
