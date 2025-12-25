import { Command } from 'commander';
import chalk from 'chalk';
import { formatTable, error, info, success } from '../lib/formatter.js';
import { getMozCredentials, setMozCredentials } from '../lib/auth.js';

const MOZ_API = 'https://lsapi.seomoz.com/v2';

interface MozUrlMetrics {
  page: string;
  subdomain: string;
  root_domain: string;
  title: string;
  last_crawled: string;
  http_code: number;
  pages_to_page: number;
  nofollow_pages_to_page: number;
  redirect_pages_to_page: number;
  external_pages_to_page: number;
  external_nofollow_pages_to_page: number;
  external_redirect_pages_to_page: number;
  deleted_pages_to_page: number;
  root_domains_to_page: number;
  indirect_root_domains_to_page: number;
  deleted_root_domains_to_page: number;
  nofollow_root_domains_to_page: number;
  pages_to_subdomain: number;
  nofollow_pages_to_subdomain: number;
  redirect_pages_to_subdomain: number;
  external_pages_to_subdomain: number;
  external_nofollow_pages_to_subdomain: number;
  external_redirect_pages_to_subdomain: number;
  deleted_pages_to_subdomain: number;
  root_domains_to_subdomain: number;
  deleted_root_domains_to_subdomain: number;
  nofollow_root_domains_to_subdomain: number;
  pages_to_root_domain: number;
  nofollow_pages_to_root_domain: number;
  redirect_pages_to_root_domain: number;
  external_pages_to_root_domain: number;
  external_indirect_pages_to_root_domain: number;
  external_nofollow_pages_to_root_domain: number;
  external_redirect_pages_to_root_domain: number;
  deleted_pages_to_root_domain: number;
  root_domains_to_root_domain: number;
  indirect_root_domains_to_root_domain: number;
  deleted_root_domains_to_root_domain: number;
  nofollow_root_domains_to_root_domain: number;
  page_authority: number;
  domain_authority: number;
  link_propensity: number;
  spam_score: number;
  root_domains_from_page: number;
  nofollow_root_domains_from_page: number;
  pages_from_page: number;
  nofollow_pages_from_page: number;
  root_domains_from_root_domain: number;
  nofollow_root_domains_from_root_domain: number;
  pages_from_root_domain: number;
  nofollow_pages_from_root_domain: number;
  pages_crawled_from_root_domain: number;
}

function requireCredentials(): { accessId: string; secretKey: string } {
  const creds = getMozCredentials();
  if (!creds.accessId || !creds.secretKey) {
    throw new Error(
      'Moz API credentials not configured.\n' +
      'Get your credentials from: https://moz.com/products/api\n' +
      'Then run: seo-cli moz auth --id <access-id> --secret <secret-key>'
    );
  }
  return { accessId: creds.accessId, secretKey: creds.secretKey };
}

async function mozRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const { accessId, secretKey } = requireCredentials();

  const auth = Buffer.from(`${accessId}:${secretKey}`).toString('base64');

  const response = await fetch(`${MOZ_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Moz API error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<T>;
}

function getScoreColor(score: number, max: number = 100): (text: string) => string {
  const percent = (score / max) * 100;
  if (percent >= 60) return chalk.green;
  if (percent >= 30) return chalk.yellow;
  return chalk.red;
}

function getSpamScoreColor(score: number): (text: string) => string {
  // Spam score: lower is better (1-17 scale, 1-4 low, 5-7 medium, 8+ high)
  if (score <= 4) return chalk.green;
  if (score <= 7) return chalk.yellow;
  return chalk.red;
}

export function createMozCommand(): Command {
  const moz = new Command('moz')
    .description('Moz API - domain authority and backlink analysis');

  // Auth command
  moz
    .command('auth')
    .description('Configure Moz API credentials')
    .requiredOption('--id <accessId>', 'Moz Access ID')
    .requiredOption('--secret <secretKey>', 'Moz Secret Key')
    .action((options) => {
      try {
        setMozCredentials(options.id, options.secret);
        success('Moz API credentials saved');
        info('Get your credentials from: https://moz.com/products/api');
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to save credentials');
        process.exit(1);
      }
    });

  // URL metrics (main command)
  moz
    .command('check <url>')
    .description('Get domain authority and metrics for a URL')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .action(async (url, options) => {
      try {
        // Normalize URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        info(`Fetching Moz metrics for ${url}...\n`);

        const data = await mozRequest<{ results: MozUrlMetrics[] }>('url_metrics', {
          targets: [url],
        });

        const metrics = data.results?.[0];

        if (!metrics) {
          error('No data returned for this URL');
          process.exit(1);
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(metrics, null, 2));
          return;
        }

        console.log(chalk.bold.cyan('📊 Moz Metrics\n'));

        // Authority scores
        console.log(chalk.bold('Authority Scores:'));
        const authorityRows = [
          ['Domain Authority (DA)', getScoreColor(metrics.domain_authority)(`${metrics.domain_authority}`)],
          ['Page Authority (PA)', getScoreColor(metrics.page_authority)(`${metrics.page_authority}`)],
          ['Spam Score', getSpamScoreColor(metrics.spam_score)(`${metrics.spam_score}%`)],
        ];
        console.log(formatTable(['Metric', 'Score'], authorityRows));

        // Link metrics
        console.log(chalk.bold('\nLink Metrics (to Root Domain):'));
        const linkRows = [
          ['Linking Root Domains', metrics.root_domains_to_root_domain?.toLocaleString() || '0'],
          ['Total Backlinks', metrics.external_pages_to_root_domain?.toLocaleString() || '0'],
          ['Nofollow Links', metrics.external_nofollow_pages_to_root_domain?.toLocaleString() || '0'],
          ['Redirect Links', metrics.external_redirect_pages_to_root_domain?.toLocaleString() || '0'],
        ];
        console.log(formatTable(['Metric', 'Count'], linkRows));

        // Page-specific metrics
        console.log(chalk.bold('\nPage-Specific Metrics:'));
        const pageRows = [
          ['Linking Root Domains', metrics.root_domains_to_page?.toLocaleString() || '0'],
          ['Total Backlinks', metrics.pages_to_page?.toLocaleString() || '0'],
          ['External Links', metrics.external_pages_to_page?.toLocaleString() || '0'],
        ];
        console.log(formatTable(['Metric', 'Count'], pageRows));

        // Last crawled
        if (metrics.last_crawled) {
          console.log(chalk.dim(`\nLast crawled: ${new Date(metrics.last_crawled).toLocaleDateString()}`));
        }

        // Legend
        console.log(chalk.dim('\nDA/PA: 0-100 scale, higher is better'));
        console.log(chalk.dim('Spam Score: 1-17%, lower is better'));
        console.log();

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to fetch Moz metrics');
        process.exit(1);
      }
    });

  // Compare multiple domains
  moz
    .command('compare <urls...>')
    .description('Compare metrics for multiple URLs')
    .action(async (urls) => {
      try {
        // Normalize URLs
        const normalizedUrls = urls.map((url: string) => {
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return 'https://' + url;
          }
          return url;
        });

        info(`Comparing ${normalizedUrls.length} URLs...\n`);

        const data = await mozRequest<{ results: MozUrlMetrics[] }>('url_metrics', {
          targets: normalizedUrls,
        });

        console.log(chalk.bold.cyan('📊 Domain Comparison\n'));

        const rows = data.results.map((m, i) => [
          new URL(normalizedUrls[i]).hostname,
          getScoreColor(m.domain_authority)(`${m.domain_authority}`),
          getScoreColor(m.page_authority)(`${m.page_authority}`),
          getSpamScoreColor(m.spam_score)(`${m.spam_score}%`),
          m.root_domains_to_root_domain?.toLocaleString() || '0',
        ]);

        console.log(formatTable(['Domain', 'DA', 'PA', 'Spam', 'Linking Domains'], rows));
        console.log();

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to compare URLs');
        process.exit(1);
      }
    });

  return moz;
}
