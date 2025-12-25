#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { setKeyFile, getKeyFilePath } from './lib/auth.js';
import { success, error, info } from './lib/formatter.js';
import { setVerbose } from './lib/utils.js';
import { createAccountsCommand, createPropertiesCommand } from './commands/accounts.js';
import { createReportCommand } from './commands/report.js';
import { createRealtimeCommand } from './commands/realtime.js';
import { createExportCommand } from './commands/export.js';
import { createGscCommand } from './commands/gsc.js';
import { createSpeedCommand } from './commands/speed.js';
import { createCrawlCommand } from './commands/crawl.js';
import { createUptimeCommand } from './commands/uptime.js';
import { createMozCommand } from './commands/moz.js';
import { createCacheCommand } from './commands/cache.js';
import { createAuditCommand } from './commands/audit.js';

const program = new Command();

program
  .name('seo-cli')
  .description('All-in-one SEO command-line tool')
  .version('1.1.0')
  .option('-v, --verbose', 'Enable verbose debug output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
    }
  });

// Auth command
program
  .command('auth')
  .description('Configure authentication')
  .requiredOption('-k, --key-file <path>', 'Path to service account JSON key file')
  .action((options) => {
    try {
      const keyPath = resolve(options.keyFile);
      setKeyFile(keyPath);
      success(`Authentication configured successfully`);
      info(`Key file: ${keyPath}`);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to configure authentication');
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show current authentication status')
  .action(() => {
    const keyFile = getKeyFilePath();
    if (keyFile) {
      success('Authenticated');
      info(`Key file: ${keyFile}`);
    } else {
      info('Not authenticated');
      info('Run: seo-cli auth --key-file <path-to-service-account.json>');
    }
  });

// Add subcommands
program.addCommand(createAccountsCommand());
program.addCommand(createPropertiesCommand());
program.addCommand(createReportCommand());
program.addCommand(createRealtimeCommand());
program.addCommand(createExportCommand());
program.addCommand(createGscCommand());
program.addCommand(createSpeedCommand());
program.addCommand(createCrawlCommand());
program.addCommand(createUptimeCommand());
program.addCommand(createMozCommand());
program.addCommand(createCacheCommand());
program.addCommand(createAuditCommand());

program.parse();
