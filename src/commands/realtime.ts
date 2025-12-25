import { Command } from 'commander';
import chalk from 'chalk';
import { getDataClient, formatPropertyId } from '../lib/client.js';
import { formatTable, error, info } from '../lib/formatter.js';
import { getDefaultProperty } from '../lib/auth.js';

async function fetchRealtimeData(propertyId: string): Promise<void> {
  const client = getDataClient();
  const property = formatPropertyId(propertyId);

  // Fetch active users
  const [activeUsersResponse] = await client.runRealtimeReport({
    property,
    metrics: [{ name: 'activeUsers' }],
  });

  const activeUsers = activeUsersResponse.rows?.[0]?.metricValues?.[0]?.value || '0';

  // Fetch active users by page
  const [pagesResponse] = await client.runRealtimeReport({
    property,
    dimensions: [{ name: 'unifiedScreenName' }],
    metrics: [{ name: 'activeUsers' }],
    limit: 10,
  });

  // Fetch active users by country
  const [countryResponse] = await client.runRealtimeReport({
    property,
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'activeUsers' }],
    limit: 10,
  });

  // Fetch active users by traffic source
  const [sourceResponse] = await client.runRealtimeReport({
    property,
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'activeUsers' }],
    limit: 10,
  });

  // Clear screen for watch mode
  console.clear();

  // Display results
  console.log(chalk.bold.cyan('\n📊 Real-time Analytics\n'));
  console.log(chalk.bold(`Active Users: ${chalk.green(activeUsers)}\n`));

  // Top Pages
  if (pagesResponse.rows && pagesResponse.rows.length > 0) {
    console.log(chalk.bold.yellow('Top Pages:'));
    const pageRows = pagesResponse.rows.map(row => [
      row.dimensionValues?.[0]?.value || 'Unknown',
      row.metricValues?.[0]?.value || '0',
    ]);
    console.log(formatTable(['Page', 'Users'], pageRows));
    console.log();
  }

  // Top Countries
  if (countryResponse.rows && countryResponse.rows.length > 0) {
    console.log(chalk.bold.yellow('Top Countries:'));
    const countryRows = countryResponse.rows.map(row => [
      row.dimensionValues?.[0]?.value || 'Unknown',
      row.metricValues?.[0]?.value || '0',
    ]);
    console.log(formatTable(['Country', 'Users'], countryRows));
    console.log();
  }

  // Traffic Sources
  if (sourceResponse.rows && sourceResponse.rows.length > 0) {
    console.log(chalk.bold.yellow('Traffic Sources:'));
    const sourceRows = sourceResponse.rows.map(row => [
      row.dimensionValues?.[0]?.value || '(direct)',
      row.metricValues?.[0]?.value || '0',
    ]);
    console.log(formatTable(['Source', 'Users'], sourceRows));
    console.log();
  }

  console.log(chalk.dim(`Last updated: ${new Date().toLocaleTimeString()}`));
}

export function createRealtimeCommand(): Command {
  const realtime = new Command('realtime')
    .description('View real-time analytics data')
    .option('-p, --property <id>', 'Property ID (uses default if set)')
    .option('-w, --watch', 'Auto-refresh data', false)
    .option('-i, --interval <seconds>', 'Refresh interval in seconds', '30')
    .action(async (options) => {
      try {
        const property = options.property || getDefaultProperty();
        if (!property) {
          error('Property ID is required. Use --property or set a default with: ga-cli properties set-default <id>');
          process.exit(1);
        }

        info(`Fetching real-time data for property ${property}...`);

        await fetchRealtimeData(property);

        if (options.watch) {
          const interval = parseInt(options.interval, 10) * 1000;
          info(`Watching mode enabled. Refreshing every ${options.interval} seconds. Press Ctrl+C to stop.`);

          setInterval(async () => {
            try {
              await fetchRealtimeData(property);
            } catch (e) {
              error(e instanceof Error ? e.message : 'Failed to refresh data');
            }
          }, interval);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to fetch real-time data');
        process.exit(1);
      }
    });

  return realtime;
}
