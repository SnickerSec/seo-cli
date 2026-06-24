#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { setKeyFile, getKeyFilePath, checkKeyFilePermissions } from './lib/auth.js';
import { success, error, info, warn } from './lib/formatter.js';
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
import { createCompareCommand, createPageDiffCommand } from './commands/compare.js';
import { createSerpCommand } from './commands/serp.js';
import { createInternalLinksCommand } from './commands/internalLinks.js';
import { createInitCommand } from './commands/init.js';
import { createRobotsCommand } from './commands/robots.js';
import { createSitemapCommand } from './commands/sitemap.js';
import { createHeadersCommand } from './commands/headers.js';
import { createRedirectsCommand } from './commands/redirects.js';
import { createSchemaCommand } from './commands/schema.js';
import { createContentCommand } from './commands/content.js';
import { createIndexingCommand } from './commands/indexing.js';

const program = new Command();

program
  .name('seo-cli')
  .description('All-in-one SEO command-line tool')
  .version('1.2.0')
  .option('-v, --verbose', 'Enable verbose debug output')
  .option('--json', 'Shorthand for --format json (applies to subcommands that support it)')
  .hook('preAction', (thisCommand, actionCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
    }
    if (opts.json) {
      // Propagate to the subcommand if it accepts --format and one wasn't set.
      const subOpts = actionCommand.opts();
      if ('format' in subOpts && (subOpts.format === undefined || subOpts.format === 'table')) {
        actionCommand.setOptionValue('format', 'json');
      }
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
      const permWarning = checkKeyFilePermissions(keyPath);
      if (permWarning) warn(permWarning);
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
      const permWarning = checkKeyFilePermissions(keyFile);
      if (permWarning) warn(permWarning);
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
program.addCommand(createCompareCommand());
program.addCommand(createRobotsCommand());
program.addCommand(createSitemapCommand());
program.addCommand(createHeadersCommand());
program.addCommand(createRedirectsCommand());
program.addCommand(createSchemaCommand());
program.addCommand(createContentCommand());
program.addCommand(createIndexingCommand());
program.addCommand(createPageDiffCommand());
program.addCommand(createSerpCommand());
program.addCommand(createInternalLinksCommand());
program.addCommand(createInitCommand());

program.parse();
