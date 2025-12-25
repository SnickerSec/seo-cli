import { Command } from 'commander';
import chalk from 'chalk';
import { formatTable, formatOutput, error, info, success, warn } from '../lib/formatter.js';
import { getUptimeRobotApiKey, setUptimeRobotApiKey } from '../lib/auth.js';

const UPTIMEROBOT_API = 'https://api.uptimerobot.com/v2';

interface UptimeMonitor {
  id: number;
  friendly_name: string;
  url: string;
  type: number;
  status: number;
  all_time_uptime_ratio: string;
  average_response_time: string;
  create_datetime: number;
}

interface UptimeResponse {
  stat: string;
  monitors?: UptimeMonitor[];
  error?: { message: string };
}

interface AlertContact {
  id: string;
  friendly_name: string;
  type: number;
  status: number;
  value: string;
}

interface AlertContactResponse {
  stat: string;
  alert_contacts?: AlertContact[];
  error?: { message: string };
}

function getStatusText(status: number): string {
  switch (status) {
    case 0: return chalk.gray('Paused');
    case 1: return chalk.gray('Not checked');
    case 2: return chalk.green('Up');
    case 8: return chalk.yellow('Seems down');
    case 9: return chalk.red('Down');
    default: return chalk.gray('Unknown');
  }
}

function getMonitorTypeText(type: number): string {
  switch (type) {
    case 1: return 'HTTP(s)';
    case 2: return 'Keyword';
    case 3: return 'Ping';
    case 4: return 'Port';
    case 5: return 'Heartbeat';
    default: return 'Unknown';
  }
}

function requireApiKey(): string {
  const apiKey = getUptimeRobotApiKey();
  if (!apiKey) {
    throw new Error(
      'UptimeRobot API key not configured.\n' +
      'Get your API key from: https://uptimerobot.com/dashboard#mySettings\n' +
      'Then run: seo-cli uptime auth --api-key <your-api-key>'
    );
  }
  return apiKey;
}

async function apiRequest<T>(endpoint: string, body: Record<string, string | number>): Promise<T> {
  const apiKey = requireApiKey();

  const response = await fetch(`${UPTIMEROBOT_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      format: 'json',
      ...body,
    }),
  });

  const data = await response.json() as T & { stat: string; error?: { message: string } };

  if (data.stat !== 'ok') {
    throw new Error(data.error?.message || 'UptimeRobot API error');
  }

  return data;
}

export function createUptimeCommand(): Command {
  const uptime = new Command('uptime')
    .description('UptimeRobot - monitor website uptime');

  // Auth command
  uptime
    .command('auth')
    .description('Configure UptimeRobot API key')
    .requiredOption('-k, --api-key <key>', 'UptimeRobot API key (get from dashboard)')
    .action((options) => {
      try {
        setUptimeRobotApiKey(options.apiKey);
        success('UptimeRobot API key saved');
        info('Get your API key from: https://uptimerobot.com/dashboard#mySettings');
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to save API key');
        process.exit(1);
      }
    });

  // List monitors
  uptime
    .command('monitors')
    .description('List all monitors')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .action(async (options) => {
      try {
        const data = await apiRequest<UptimeResponse>('getMonitors', {
          response_times: 1,
          response_times_limit: 1,
        });

        const monitors = data.monitors || [];

        if (monitors.length === 0) {
          info('No monitors found. Add one with: seo-cli uptime add <url>');
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(monitors, null, 2));
          return;
        }

        console.log(chalk.bold.cyan('\n📡 Uptime Monitors\n'));

        const rows = monitors.map(m => [
          m.friendly_name,
          getStatusText(m.status),
          `${parseFloat(m.all_time_uptime_ratio).toFixed(2)}%`,
          `${m.average_response_time}ms`,
          getMonitorTypeText(m.type),
        ]);

        console.log(formatTable(['Name', 'Status', 'Uptime', 'Avg Response', 'Type'], rows));
        console.log();
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to fetch monitors');
        process.exit(1);
      }
    });

  // Quick status overview
  uptime
    .command('status')
    .description('Quick status overview')
    .action(async () => {
      try {
        const data = await apiRequest<UptimeResponse>('getMonitors', {});
        const monitors = data.monitors || [];

        if (monitors.length === 0) {
          info('No monitors configured');
          return;
        }

        const up = monitors.filter(m => m.status === 2).length;
        const down = monitors.filter(m => m.status === 9).length;
        const paused = monitors.filter(m => m.status === 0).length;
        const other = monitors.length - up - down - paused;

        console.log(chalk.bold.cyan('\n📊 Uptime Status\n'));
        console.log(`  ${chalk.green('●')} Up: ${up}`);
        console.log(`  ${chalk.red('●')} Down: ${down}`);
        console.log(`  ${chalk.gray('●')} Paused: ${paused}`);
        if (other > 0) console.log(`  ${chalk.yellow('●')} Other: ${other}`);
        console.log();

        // Show any down monitors
        const downMonitors = monitors.filter(m => m.status === 9);
        if (downMonitors.length > 0) {
          console.log(chalk.red.bold('⚠️  DOWN:\n'));
          downMonitors.forEach(m => {
            console.log(`  ${chalk.red('•')} ${m.friendly_name}`);
            console.log(chalk.dim(`    ${m.url}`));
          });
          console.log();
        }
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to fetch status');
        process.exit(1);
      }
    });

  // Add monitor
  uptime
    .command('add <url>')
    .description('Add a new monitor')
    .option('-n, --name <name>', 'Friendly name for the monitor')
    .option('-t, --type <type>', 'Monitor type: http, keyword, ping', 'http')
    .option('-i, --interval <seconds>', 'Check interval in seconds (min 60)', '300')
    .action(async (url, options) => {
      try {
        // Normalize URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        const typeMap: Record<string, number> = {
          http: 1,
          keyword: 2,
          ping: 3,
        };

        const monitorType = typeMap[options.type] || 1;
        const friendlyName = options.name || new URL(url).hostname;
        const interval = Math.max(60, parseInt(options.interval, 10));

        const data = await apiRequest<{ stat: string; monitor?: { id: number } }>('newMonitor', {
          type: monitorType,
          url,
          friendly_name: friendlyName,
          interval,
        });

        success(`Monitor created: ${friendlyName}`);
        info(`URL: ${url}`);
        info(`Check interval: ${interval} seconds`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to create monitor');
        process.exit(1);
      }
    });

  // Delete monitor
  uptime
    .command('delete <id>')
    .description('Delete a monitor by ID')
    .action(async (id) => {
      try {
        await apiRequest('deleteMonitor', { id: parseInt(id, 10) });
        success(`Monitor ${id} deleted`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to delete monitor');
        process.exit(1);
      }
    });

  // Pause/resume monitor
  uptime
    .command('pause <id>')
    .description('Pause a monitor')
    .action(async (id) => {
      try {
        await apiRequest('editMonitor', { id: parseInt(id, 10), status: 0 });
        success(`Monitor ${id} paused`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to pause monitor');
        process.exit(1);
      }
    });

  uptime
    .command('resume <id>')
    .description('Resume a paused monitor')
    .action(async (id) => {
      try {
        await apiRequest('editMonitor', { id: parseInt(id, 10), status: 1 });
        success(`Monitor ${id} resumed`);
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to resume monitor');
        process.exit(1);
      }
    });

  // List alert contacts
  uptime
    .command('alerts')
    .description('List alert contacts')
    .action(async () => {
      try {
        const data = await apiRequest<AlertContactResponse>('getAlertContacts', {});
        const contacts = data.alert_contacts || [];

        if (contacts.length === 0) {
          info('No alert contacts configured');
          info('Add alert contacts at: https://uptimerobot.com/dashboard#alertContacts');
          return;
        }

        console.log(chalk.bold.cyan('\n🔔 Alert Contacts\n'));

        const typeNames: Record<number, string> = {
          1: 'SMS',
          2: 'Email',
          3: 'Twitter DM',
          4: 'Boxcar',
          5: 'Webhook',
          6: 'Pushbullet',
          7: 'Zapier',
          9: 'Pushover',
          10: 'HipChat',
          11: 'Slack',
        };

        const rows = contacts.map(c => [
          c.friendly_name,
          typeNames[c.type] || 'Unknown',
          c.status === 2 ? chalk.green('Active') : chalk.gray('Inactive'),
        ]);

        console.log(formatTable(['Name', 'Type', 'Status'], rows));
        console.log();
      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to fetch alert contacts');
        process.exit(1);
      }
    });

  return uptime;
}
