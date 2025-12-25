import { Command } from 'commander';
import { getSearchConsoleClient } from '../lib/client.js';
import { formatOutput, error, info, success } from '../lib/formatter.js';
import { getDefaultSite, setDefaultSite } from '../lib/auth.js';
import type { SearchConsoleQueryOptions } from '../types/index.js';

function formatDate(dateStr: string): string {
  // Handle relative dates
  const today = new Date();

  if (dateStr === 'today') {
    return today.toISOString().split('T')[0];
  }

  if (dateStr === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  const daysAgoMatch = dateStr.match(/^(\d+)daysAgo$/);
  if (daysAgoMatch) {
    const daysAgo = parseInt(daysAgoMatch[1], 10);
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  }

  // Assume it's already in YYYY-MM-DD format
  return dateStr;
}

export async function runSearchAnalytics(options: SearchConsoleQueryOptions): Promise<{
  headers: string[];
  rows: (string | number)[][];
}> {
  const client = getSearchConsoleClient();

  const dimensions = options.dimensions
    ? options.dimensions.split(',').map(d => d.trim())
    : [];

  const response = await client.searchanalytics.query({
    siteUrl: options.site,
    requestBody: {
      startDate: formatDate(options.startDate),
      endDate: formatDate(options.endDate),
      dimensions,
      rowLimit: options.limit || 1000,
      type: options.type || 'web',
    },
  });

  const headers = [...dimensions, 'clicks', 'impressions', 'ctr', 'position'];
  const rows: (string | number)[][] = [];

  if (response.data.rows) {
    for (const row of response.data.rows) {
      const dimensionValues = row.keys || [];
      rows.push([
        ...dimensionValues,
        row.clicks || 0,
        row.impressions || 0,
        ((row.ctr || 0) * 100).toFixed(2) + '%',
        (row.position || 0).toFixed(1),
      ]);
    }
  }

  return { headers, rows };
}

export function createGscCommand(): Command {
  const gsc = new Command('gsc')
    .description('Google Search Console commands');

  // Sites subcommand
  gsc
    .command('sites')
    .description('List all verified sites')
    .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
    .action(async (options) => {
      try {
        const client = getSearchConsoleClient();
        const response = await client.sites.list();

        const headers = ['Site URL', 'Permission Level'];
        const rows: (string | number)[][] = [];

        if (response.data.siteEntry) {
          for (const site of response.data.siteEntry) {
            rows.push([
              site.siteUrl || '',
              site.permissionLevel || '',
            ]);
          }
        }

        if (rows.length === 0) {
          info('No sites found. Make sure the service account has access to Search Console properties.');
          return;
        }

        console.log(formatOutput(headers, rows, options.format));
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to list sites');
        process.exit(1);
      }
    });

  // Set default site
  gsc
    .command('set-default <siteUrl>')
    .description('Set the default site URL for commands')
    .action((siteUrl) => {
      try {
        setDefaultSite(siteUrl);
        success(`Default site set to: ${siteUrl}`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to set default site');
        process.exit(1);
      }
    });

  // Query subcommand
  gsc
    .command('query')
    .description('Query search analytics data')
    .option('-s, --site <url>', 'Site URL (uses default if set)')
    .option('-d, --dimensions <dimensions>', 'Comma-separated dimensions: query, page, country, device, date')
    .option('--start-date <date>', 'Start date (e.g., 7daysAgo, 2024-01-01)', '7daysAgo')
    .option('--end-date <date>', 'End date (e.g., today, 2024-01-31)', 'today')
    .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
    .option('-l, --limit <number>', 'Maximum number of rows', '100')
    .option('-t, --type <type>', 'Search type: web, image, video, news, discover, googleNews', 'web')
    .action(async (options) => {
      try {
        const site = options.site || getDefaultSite();
        if (!site) {
          error('Site URL is required. Use --site or set a default with: ga-cli gsc set-default <url>');
          process.exit(1);
        }

        const queryOptions: SearchConsoleQueryOptions = {
          site,
          startDate: options.startDate,
          endDate: options.endDate,
          dimensions: options.dimensions,
          format: options.format,
          limit: parseInt(options.limit, 10),
          type: options.type,
        };

        info(`Fetching search analytics for ${site}...`);
        const { headers, rows } = await runSearchAnalytics(queryOptions);

        if (rows.length === 0) {
          info('No data found for the specified criteria.');
          return;
        }

        console.log(formatOutput(headers, rows, queryOptions.format));
        info(`${rows.length} rows returned`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to query search analytics');
        process.exit(1);
      }
    });

  // Inspect URL subcommand
  gsc
    .command('inspect')
    .description('Inspect a URL for indexing status')
    .requiredOption('-u, --url <url>', 'URL to inspect')
    .option('-s, --site <siteUrl>', 'Site URL (uses default if set)')
    .action(async (options) => {
      try {
        const site = options.site || getDefaultSite();
        if (!site) {
          error('Site URL is required. Use --site or set a default with: ga-cli gsc set-default <url>');
          process.exit(1);
        }

        const client = getSearchConsoleClient();

        info(`Inspecting URL: ${options.url}`);

        const response = await client.urlInspection.index.inspect({
          requestBody: {
            inspectionUrl: options.url,
            siteUrl: site,
          },
        });

        const result = response.data.inspectionResult;

        if (!result) {
          info('No inspection data available');
          return;
        }

        const headers = ['Property', 'Value'];
        const rows: (string | number)[][] = [];

        // Index status
        if (result.indexStatusResult) {
          rows.push(['Coverage State', result.indexStatusResult.coverageState || 'Unknown']);
          rows.push(['Indexing State', result.indexStatusResult.indexingState || 'Unknown']);
          rows.push(['Page Fetch State', result.indexStatusResult.pageFetchState || 'Unknown']);
          rows.push(['Robots.txt State', result.indexStatusResult.robotsTxtState || 'Unknown']);
          if (result.indexStatusResult.lastCrawlTime) {
            rows.push(['Last Crawl Time', result.indexStatusResult.lastCrawlTime]);
          }
          if (result.indexStatusResult.crawledAs) {
            rows.push(['Crawled As', result.indexStatusResult.crawledAs]);
          }
        }

        // Mobile usability
        if (result.mobileUsabilityResult) {
          rows.push(['Mobile Usability', result.mobileUsabilityResult.verdict || 'Unknown']);
        }

        console.log(formatOutput(headers, rows, 'table'));
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to inspect URL');
        process.exit(1);
      }
    });

  // Sitemaps subcommand group
  const sitemaps = new Command('sitemaps')
    .description('Manage sitemaps');

  sitemaps
    .command('list')
    .description('List all sitemaps for a site')
    .option('-s, --site <url>', 'Site URL (uses default if set)')
    .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
    .action(async (options) => {
      try {
        const site = options.site || getDefaultSite();
        if (!site) {
          error('Site URL is required. Use --site or set a default with: ga-cli gsc set-default <url>');
          process.exit(1);
        }

        const client = getSearchConsoleClient();
        const response = await client.sitemaps.list({ siteUrl: site });

        const headers = ['Sitemap URL', 'Type', 'Last Submitted', 'Last Downloaded', 'Warnings', 'Errors'];
        const rows: (string | number)[][] = [];

        if (response.data.sitemap) {
          for (const sitemap of response.data.sitemap) {
            rows.push([
              sitemap.path || '',
              sitemap.type || '',
              sitemap.lastSubmitted || '-',
              sitemap.lastDownloaded || '-',
              sitemap.warnings || 0,
              sitemap.errors || 0,
            ]);
          }
        }

        if (rows.length === 0) {
          info('No sitemaps found for this site.');
          return;
        }

        console.log(formatOutput(headers, rows, options.format));
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to list sitemaps');
        process.exit(1);
      }
    });

  sitemaps
    .command('submit <sitemapUrl>')
    .description('Submit a sitemap')
    .option('-s, --site <url>', 'Site URL (uses default if set)')
    .action(async (sitemapUrl, options) => {
      try {
        const site = options.site || getDefaultSite();
        if (!site) {
          error('Site URL is required. Use --site or set a default with: ga-cli gsc set-default <url>');
          process.exit(1);
        }

        const client = getSearchConsoleClient();
        await client.sitemaps.submit({
          siteUrl: site,
          feedpath: sitemapUrl,
        });

        success(`Sitemap submitted: ${sitemapUrl}`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to submit sitemap');
        process.exit(1);
      }
    });

  sitemaps
    .command('delete <sitemapUrl>')
    .description('Delete a sitemap')
    .option('-s, --site <url>', 'Site URL (uses default if set)')
    .action(async (sitemapUrl, options) => {
      try {
        const site = options.site || getDefaultSite();
        if (!site) {
          error('Site URL is required. Use --site or set a default with: ga-cli gsc set-default <url>');
          process.exit(1);
        }

        const client = getSearchConsoleClient();
        await client.sitemaps.delete({
          siteUrl: site,
          feedpath: sitemapUrl,
        });

        success(`Sitemap deleted: ${sitemapUrl}`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to delete sitemap');
        process.exit(1);
      }
    });

  gsc.addCommand(sitemaps);

  return gsc;
}
