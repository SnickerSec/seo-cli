import { Command } from 'commander';
import { getAdminClient, formatPropertyId, extractPropertyNumber } from '../lib/client.js';
import { formatOutput, error, info } from '../lib/formatter.js';
import { setDefaultProperty } from '../lib/auth.js';

export function createAccountsCommand(): Command {
  const accounts = new Command('accounts')
    .description('Manage Google Analytics accounts');

  accounts
    .command('list')
    .description('List all accessible accounts and their properties')
    .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
    .action(async (options) => {
      try {
        const client = getAdminClient();
        const [summaries] = await client.listAccountSummaries();

        const headers = ['Account', 'Account ID', 'Property', 'Property ID'];
        const rows: (string | number)[][] = [];

        for (const summary of summaries) {
          const accountName = summary.displayName || 'Unknown';
          const accountId = summary.account?.replace('accounts/', '') || '';

          if (summary.propertySummaries && summary.propertySummaries.length > 0) {
            for (const prop of summary.propertySummaries) {
              rows.push([
                accountName,
                accountId,
                prop.displayName || 'Unknown',
                extractPropertyNumber(prop.property || ''),
              ]);
            }
          } else {
            rows.push([accountName, accountId, '-', '-']);
          }
        }

        if (rows.length === 0) {
          info('No accounts found. Make sure the service account has access to Google Analytics properties.');
          return;
        }

        console.log(formatOutput(headers, rows, options.format));
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to list accounts');
        process.exit(1);
      }
    });

  return accounts;
}

export function createPropertiesCommand(): Command {
  const properties = new Command('properties')
    .description('Manage Google Analytics properties');

  properties
    .command('list')
    .description('List all accessible properties')
    .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
    .action(async (options) => {
      try {
        const client = getAdminClient();
        const [summaries] = await client.listAccountSummaries();

        const headers = ['Property Name', 'Property ID', 'Account'];
        const rows: (string | number)[][] = [];

        for (const summary of summaries) {
          if (summary.propertySummaries) {
            for (const prop of summary.propertySummaries) {
              rows.push([
                prop.displayName || 'Unknown',
                extractPropertyNumber(prop.property || ''),
                summary.displayName || 'Unknown',
              ]);
            }
          }
        }

        if (rows.length === 0) {
          info('No properties found.');
          return;
        }

        console.log(formatOutput(headers, rows, options.format));
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to list properties');
        process.exit(1);
      }
    });

  properties
    .command('get <propertyId>')
    .description('Get details for a specific property')
    .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
    .action(async (propertyId, options) => {
      try {
        const client = getAdminClient();
        const [property] = await client.getProperty({
          name: formatPropertyId(propertyId),
        });

        const headers = ['Field', 'Value'];
        const rows: (string | number)[][] = [
          ['Name', property.displayName || ''],
          ['Property ID', extractPropertyNumber(property.name || '')],
          ['Time Zone', property.timeZone || ''],
          ['Currency', property.currencyCode || ''],
          ['Industry', property.industryCategory || ''],
          ['Create Time', property.createTime?.seconds?.toString() || ''],
        ];

        console.log(formatOutput(headers, rows, options.format));
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to get property');
        process.exit(1);
      }
    });

  properties
    .command('set-default <propertyId>')
    .description('Set the default property for commands')
    .action((propertyId) => {
      try {
        setDefaultProperty(propertyId);
        info(`Default property set to: ${propertyId}`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to set default property');
        process.exit(1);
      }
    });

  return properties;
}
