import { Command } from 'commander';
import { getDataClient, formatPropertyId } from '../lib/client.js';
import { formatOutput, error, info } from '../lib/formatter.js';
import { getDefaultProperty } from '../lib/auth.js';
import type { ReportOptions } from '../types/index.js';

export async function runReport(options: ReportOptions): Promise<{
  headers: string[];
  rows: (string | number)[][];
}> {
  const client = getDataClient();
  const propertyId = formatPropertyId(options.property);

  const metrics = options.metrics.split(',').map(m => ({ name: m.trim() }));
  const dimensions = options.dimensions
    ? options.dimensions.split(',').map(d => ({ name: d.trim() }))
    : [];

  const [response] = await client.runReport({
    property: propertyId,
    dateRanges: [
      {
        startDate: options.startDate,
        endDate: options.endDate,
      },
    ],
    metrics,
    dimensions,
    limit: options.limit || 10000,
  });

  const dimensionHeaders = response.dimensionHeaders?.map(h => h.name || '') || [];
  const metricHeaders = response.metricHeaders?.map(h => h.name || '') || [];
  const headers = [...dimensionHeaders, ...metricHeaders];

  const rows: (string | number)[][] = [];

  if (response.rows) {
    for (const row of response.rows) {
      const dimensionValues = row.dimensionValues?.map(v => v.value || '') || [];
      const metricValues = row.metricValues?.map(v => {
        const val = v.value || '0';
        return isNaN(Number(val)) ? val : Number(val);
      }) || [];
      rows.push([...dimensionValues, ...metricValues]);
    }
  }

  return { headers, rows };
}

export function createReportCommand(): Command {
  const report = new Command('report')
    .description('Query Google Analytics reports')
    .requiredOption('-m, --metrics <metrics>', 'Comma-separated list of metrics (e.g., sessions,pageviews,users)')
    .option('-p, --property <id>', 'Property ID (uses default if set)')
    .option('-d, --dimensions <dimensions>', 'Comma-separated list of dimensions (e.g., date,country)')
    .option('-s, --start-date <date>', 'Start date (e.g., 7daysAgo, 2024-01-01)', '7daysAgo')
    .option('-e, --end-date <date>', 'End date (e.g., today, 2024-01-31)', 'today')
    .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
    .option('-l, --limit <number>', 'Maximum number of rows', '100')
    .action(async (options) => {
      try {
        const property = options.property || getDefaultProperty();
        if (!property) {
          error('Property ID is required. Use --property or set a default with: ga-cli properties set-default <id>');
          process.exit(1);
        }

        const reportOptions: ReportOptions = {
          property,
          metrics: options.metrics,
          dimensions: options.dimensions,
          startDate: options.startDate,
          endDate: options.endDate,
          format: options.format,
          limit: parseInt(options.limit, 10),
        };

        info(`Fetching report for property ${property}...`);
        const { headers, rows } = await runReport(reportOptions);

        if (rows.length === 0) {
          info('No data found for the specified criteria.');
          return;
        }

        console.log(formatOutput(headers, rows, reportOptions.format));
        info(`${rows.length} rows returned`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to run report');
        process.exit(1);
      }
    });

  return report;
}
