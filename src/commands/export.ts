import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { resolve, normalize } from 'path';
import { runReport } from './report.js';
import { formatOutput, error, success, info } from '../lib/formatter.js';
import { getDefaultProperty } from '../lib/auth.js';
import type { ExportOptions } from '../types/index.js';

function validateOutputPath(outputPath: string): string {
  const resolved = resolve(normalize(outputPath));
  const cwd = process.cwd();

  // Ensure path is within current working directory
  if (!resolved.startsWith(cwd + '/') && resolved !== cwd) {
    throw new Error(`Output path must be within the current working directory: ${cwd}`);
  }

  // Block sensitive file patterns
  const sensitivePatterns = [/\.env/, /\.ssh/, /\.git\//, /\.seo-cli/];
  for (const pattern of sensitivePatterns) {
    if (pattern.test(resolved)) {
      throw new Error(`Cannot write to sensitive path: ${resolved}`);
    }
  }

  return resolved;
}

export function createExportCommand(): Command {
  const exportCmd = new Command('export')
    .description('Export analytics data to a file')
    .requiredOption('-m, --metrics <metrics>', 'Comma-separated list of metrics (e.g., sessions,pageviews,users)')
    .requiredOption('-o, --output <path>', 'Output file path')
    .option('-p, --property <id>', 'Property ID (uses default if set)')
    .option('-d, --dimensions <dimensions>', 'Comma-separated list of dimensions (e.g., date,country)')
    .option('-s, --start-date <date>', 'Start date (e.g., 7daysAgo, 2024-01-01)', '7daysAgo')
    .option('-e, --end-date <date>', 'End date (e.g., today, 2024-01-31)', 'today')
    .option('-f, --format <format>', 'Output format (json, csv)', 'csv')
    .option('-l, --limit <number>', 'Maximum number of rows', '10000')
    .action(async (options) => {
      try {
        const property = options.property || getDefaultProperty();
        if (!property) {
          error('Property ID is required. Use --property or set a default with: ga-cli properties set-default <id>');
          process.exit(1);
        }

        // Validate format
        if (!['json', 'csv'].includes(options.format)) {
          error('Export format must be json or csv');
          process.exit(1);
        }

        // Validate output path for security
        let validatedOutput: string;
        try {
          validatedOutput = validateOutputPath(options.output);
        } catch (e) {
          error(e instanceof Error ? e.message : 'Invalid output path');
          process.exit(1);
        }

        const exportOptions: ExportOptions = {
          property,
          metrics: options.metrics,
          dimensions: options.dimensions,
          startDate: options.startDate,
          endDate: options.endDate,
          format: options.format,
          limit: parseInt(options.limit, 10),
          output: validatedOutput,
        };

        info(`Exporting data for property ${property}...`);
        const { headers, rows } = await runReport(exportOptions);

        if (rows.length === 0) {
          info('No data found for the specified criteria.');
          return;
        }

        const content = formatOutput(headers, rows, exportOptions.format);
        writeFileSync(exportOptions.output, content);

        success(`Exported ${rows.length} rows to ${exportOptions.output}`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to export data');
        process.exit(1);
      }
    });

  return exportCmd;
}
