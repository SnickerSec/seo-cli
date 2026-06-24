import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, error, info, warn } from '../lib/formatter.js';

/**
 * No-cost SERP analysis.
 *
 * Default backend: a user-supplied SearXNG instance (meta-search, JSON output).
 * SearXNG aggregates Google/Bing/Brave/etc. results without requiring API keys.
 *
 * Why not Google/DDG scraping: both aggressively block bots. Using SearXNG puts
 * the user in control — self-host for reliability, or point at any public instance.
 * Public instance lists: https://searx.space/
 *
 * Caveats:
 *  - Positions are meta-aggregated, not a 1:1 Google SERP.
 *  - Some public instances rate-limit or disable JSON output; self-host for real use.
 */

const DEFAULT_INSTANCE = 'https://searx.be';

interface SearxResult {
  title: string;
  url: string;
  content?: string;
  engine?: string;
  engines?: string[];
}

interface SearxResponse {
  results: SearxResult[];
}

async function fetchSerp(
  query: string,
  instance: string,
  options: { lang?: string; category?: string }
): Promise<SearxResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    safesearch: '0',
  });
  if (options.lang) params.set('language', options.lang);
  if (options.category) params.set('categories', options.category);

  const url = `${instance.replace(/\/$/, '')}/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 seo-cli/1.2',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const hint = response.status === 403 || response.status === 429
      ? ' — instance is rate-limiting or has disabled JSON output. Try a different instance (https://searx.space/) or self-host SearXNG.'
      : '';
    throw new Error(`SearXNG ${response.status}${hint}\n${body.slice(0, 200)}`);
  }

  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Instance returned ${ct || 'no content-type'}, not JSON. This instance likely disables JSON output — try another (https://searx.space/) or self-host.`);
  }

  const data = await response.json() as SearxResponse;
  return data.results || [];
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function createSerpCommand(): Command {
  const serp = new Command('serp')
    .description('SERP analysis for a query (uses a SearXNG instance, no API key required)');

  serp
    .command('query <q...>')
    .description('Fetch top organic results for a query')
    .option('-i, --instance <url>', 'SearXNG instance URL', DEFAULT_INSTANCE)
    .option('--lang <code>', 'Language code (e.g., en-US, de, fr)')
    .option('--category <cat>', 'Category: general, news, images, etc.', 'general')
    .option('-l, --limit <n>', 'Max results to show', '10')
    .option('--target <domain>', 'Highlight/find a target domain in results')
    .option('-f, --format <format>', 'Output format: table, json, csv', 'table')
    .action(async (qParts: string[], options) => {
      try {
        const query = qParts.join(' ');
        info(`Searching "${query}" via ${options.instance}`);
        const all = await fetchSerp(query, options.instance, {
          lang: options.lang,
          category: options.category,
        });
        if (all.length === 0) {
          warn('No results returned.');
          return;
        }

        const results = all.map((r, i) => ({
          position: i + 1,
          title: r.title || '',
          url: r.url,
          domain: domainOf(r.url),
          snippet: r.content || '',
          engines: r.engines || (r.engine ? [r.engine] : []),
        }));

        if (options.target) {
          const target = options.target.replace(/^www\./, '').toLowerCase();
          const match = results.find((r) => r.domain.toLowerCase() === target || r.domain.toLowerCase().endsWith('.' + target));
          if (match) {
            console.log(chalk.bold.green(`\n🎯 ${options.target} found at position ${match.position}`));
            console.log(chalk.dim(`  ${match.title}`));
            console.log(chalk.dim(`  ${match.url}\n`));
          } else {
            console.log(chalk.bold.red(`\n❌ ${options.target} not found in top ${results.length} results\n`));
          }
        }

        const limit = parseInt(options.limit, 10);
        const shown = results.slice(0, limit);

        if (options.format === 'json') {
          console.log(JSON.stringify(shown, null, 2));
          return;
        }

        const headers = ['Pos', 'Domain', 'Title', 'Engines'];
        const rows = shown.map((r) => [
          r.position,
          r.domain,
          r.title.length > 55 ? r.title.slice(0, 52) + '...' : r.title,
          r.engines.slice(0, 3).join(', '),
        ]);
        console.log(formatOutput(headers, rows, options.format));
        console.log(chalk.dim(`\nSource: SearXNG meta-search. Results aggregate multiple engines and may not match Google 1:1.`));
      } catch (e) {
        error(e instanceof Error ? e.message : 'SERP query failed');
        process.exit(1);
      }
    });

  return serp;
}
