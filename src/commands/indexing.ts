import { Command } from 'commander';
import chalk from 'chalk';
import { getIndexingClient } from '../lib/client.js';
import { formatTable, error, info, success } from '../lib/formatter.js';

/**
 * Google Indexing API commands.
 *
 * Requirements:
 *  - Indexing API enabled in the GCP project
 *  - Service account added as an Owner of the property in Search Console
 *  - Official Google policy: only JobPosting or BroadcastEvent (livestream) URLs
 *    are supported. Other URL types may work but are not officially sanctioned.
 */

export function createIndexingCommand(): Command {
  const index = new Command('index')
    .description('Google Indexing API — notify Google of URL updates/removals');

  index
    .command('submit <url>')
    .description('Notify Google of a new or updated URL (URL_UPDATED)')
    .action(async (url) => {
      try {
        const client = getIndexingClient();
        const res = await client.urlNotifications.publish({
          requestBody: { url, type: 'URL_UPDATED' },
        });
        success(`Submitted: ${url}`);
        const notifyTime = res.data.urlNotificationMetadata?.latestUpdate?.notifyTime;
        if (notifyTime) info(`Notify time: ${notifyTime}`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to submit URL');
        hintPermissions();
        process.exit(1);
      }
    });

  index
    .command('remove <url>')
    .description('Notify Google that a URL has been removed (URL_DELETED)')
    .action(async (url) => {
      try {
        const client = getIndexingClient();
        await client.urlNotifications.publish({
          requestBody: { url, type: 'URL_DELETED' },
        });
        success(`Removal submitted: ${url}`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to submit removal');
        hintPermissions();
        process.exit(1);
      }
    });

  index
    .command('status <url>')
    .description('Get the latest Indexing API notification status for a URL')
    .action(async (url) => {
      try {
        const client = getIndexingClient();
        const res = await client.urlNotifications.getMetadata({ url });
        const meta = res.data;
        const rows: (string | number)[][] = [];
        if (meta.latestUpdate) {
          rows.push(['Latest Update Type', meta.latestUpdate.type || '-']);
          rows.push(['Latest Update Time', meta.latestUpdate.notifyTime || '-']);
        }
        if (meta.latestRemove) {
          rows.push(['Latest Remove Type', meta.latestRemove.type || '-']);
          rows.push(['Latest Remove Time', meta.latestRemove.notifyTime || '-']);
        }
        if (rows.length === 0) {
          info('No notifications found for this URL.');
          return;
        }
        console.log(formatTable(['Field', 'Value'], rows));
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to fetch status');
        hintPermissions();
        process.exit(1);
      }
    });

  return index;
}

function hintPermissions(): void {
  console.error(chalk.dim('Ensure: (1) Indexing API is enabled in GCP, (2) service account is an Owner in Search Console, (3) URL is on a verified property.'));
}
