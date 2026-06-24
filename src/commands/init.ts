import { Command } from 'commander';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import {
  setKeyFile,
  setDefaultSite,
  setDefaultProperty,
  setPageSpeedApiKey,
  setUptimeRobotApiKey,
  setMozCredentials,
  getKeyFilePath,
  getDefaultSite,
  getDefaultProperty,
  checkKeyFilePermissions,
} from '../lib/auth.js';
import { getSearchConsoleClient, getAdminClient } from '../lib/client.js';
import { success, info, warn, error } from '../lib/formatter.js';

/**
 * Interactive onboarding. Built on node:readline/promises — no new deps.
 *
 * Flow:
 *  1) Guide through GCP project creation + API enablement (links only — user
 *     executes these steps in a browser).
 *  2) Prompt for service account key path, validate, save.
 *  3) List accessible GSC sites / GA properties and offer to set defaults.
 *  4) Optional: configure PageSpeed / Moz / UptimeRobot keys.
 */

async function ask(rl: ReturnType<typeof createInterface>, prompt: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? chalk.dim(` [${defaultValue}]`) : '';
  const answer = (await rl.question(`${prompt}${suffix}: `)).trim();
  return answer || defaultValue || '';
}

async function confirm(rl: ReturnType<typeof createInterface>, prompt: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const ans = (await rl.question(`${prompt} (${hint}): `)).trim().toLowerCase();
  if (!ans) return defaultYes;
  return ans === 'y' || ans === 'yes';
}

function header(text: string): void {
  console.log(chalk.bold.cyan(`\n━━━ ${text} ━━━\n`));
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Interactive setup wizard')
    .action(async () => {
      const rl = createInterface({ input, output });
      try {
        console.log(chalk.bold.cyan('\n🚀 seo-cli setup wizard\n'));
        console.log('This walks through GCP setup, authentication, and default configuration.');
        console.log(chalk.dim('Press Ctrl+C at any time to abort.\n'));

        // Step 1 — GCP prerequisites
        header('Step 1 of 4 — Google Cloud project');
        console.log('You need a GCP project with the following APIs enabled:');
        console.log(`  ${chalk.cyan('•')} Search Console API`);
        console.log(`  ${chalk.cyan('•')} Google Analytics Data API`);
        console.log(`  ${chalk.cyan('•')} Google Analytics Admin API`);
        console.log(`  ${chalk.cyan('•')} PageSpeed Insights API ${chalk.dim('(optional, for speed/crux)')}`);
        console.log(`  ${chalk.cyan('•')} Chrome UX Report API ${chalk.dim('(optional, for speed crux)')}`);
        console.log(`  ${chalk.cyan('•')} Indexing API ${chalk.dim('(optional, for seo-cli index)')}`);
        console.log();
        console.log(`  Console: ${chalk.underline('https://console.cloud.google.com/apis/library')}`);
        console.log(`  Service accounts: ${chalk.underline('https://console.cloud.google.com/iam-admin/serviceaccounts')}`);
        console.log();
        console.log('Then create a service account and download its JSON key.');
        if (!(await confirm(rl, 'Continue?'))) {
          info('Setup aborted.');
          return;
        }

        // Step 2 — key file
        header('Step 2 of 4 — Service account key');
        const existingKey = getKeyFilePath();
        if (existingKey && existsSync(existingKey)) {
          info(`Found existing key: ${existingKey}`);
          if (!(await confirm(rl, 'Use this key?'))) {
            await promptKeyFile(rl);
          } else {
            const permWarning = checkKeyFilePermissions(existingKey);
            if (permWarning) warn(permWarning);
          }
        } else {
          await promptKeyFile(rl);
        }

        // Step 3 — defaults (GSC + GA)
        header('Step 3 of 4 — Defaults');
        await configureGscDefault(rl);
        await configureGaDefault(rl);

        // Step 4 — optional API keys
        header('Step 4 of 4 — Optional API keys');
        if (await confirm(rl, 'Configure a PageSpeed / CrUX API key now?', false)) {
          const k = await ask(rl, 'Google API key');
          if (k) {
            setPageSpeedApiKey(k);
            success('PageSpeed API key saved');
          }
        }
        if (await confirm(rl, 'Configure UptimeRobot API key?', false)) {
          const k = await ask(rl, 'UptimeRobot API key');
          if (k) {
            setUptimeRobotApiKey(k);
            success('UptimeRobot API key saved');
          }
        }
        if (await confirm(rl, 'Configure Moz API credentials?', false)) {
          const id = await ask(rl, 'Moz access ID');
          const secret = await ask(rl, 'Moz secret key');
          if (id && secret) {
            setMozCredentials(id, secret);
            success('Moz credentials saved');
          }
        }

        console.log(chalk.bold.green('\n✓ Setup complete.\n'));
        info('Try: seo-cli status');
        info('Or:  seo-cli gsc query --limit 10');
        console.log();
      } catch (e) {
        if (e instanceof Error && e.message.includes('readline')) {
          // Ctrl+C etc — quietly exit.
          return;
        }
        error(e instanceof Error ? e.message : 'Setup failed');
        process.exit(1);
      } finally {
        rl.close();
      }
    });
}

async function promptKeyFile(rl: ReturnType<typeof createInterface>): Promise<void> {
  while (true) {
    const path = await ask(rl, 'Path to service account JSON key file');
    if (!path) {
      warn('No path provided. Skipping key configuration.');
      return;
    }
    const resolved = resolve(path);
    try {
      setKeyFile(resolved);
      success(`Key file configured: ${resolved}`);
      const permWarning = checkKeyFilePermissions(resolved);
      if (permWarning) warn(permWarning);
      return;
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to set key file');
      if (!(await confirm(rl, 'Try again?'))) return;
    }
  }
}

async function configureGscDefault(rl: ReturnType<typeof createInterface>): Promise<void> {
  console.log(chalk.bold('\nSearch Console'));
  try {
    const client = getSearchConsoleClient();
    const response = await client.sites.list();
    const sites = response.data.siteEntry || [];
    if (sites.length === 0) {
      warn('No GSC sites accessible. Ensure the service account email is added as a user in Search Console → Settings → Users and permissions.');
      return;
    }
    const current = getDefaultSite();
    console.log('Accessible sites:');
    sites.forEach((s, i) => {
      const marker = s.siteUrl === current ? chalk.green(' (current default)') : '';
      console.log(`  ${i + 1}. ${s.siteUrl}${marker}`);
    });
    const pick = await ask(rl, 'Default site number (or blank to skip)');
    if (pick) {
      const idx = parseInt(pick, 10) - 1;
      if (idx >= 0 && idx < sites.length && sites[idx].siteUrl) {
        setDefaultSite(sites[idx].siteUrl!);
        success(`Default site: ${sites[idx].siteUrl}`);
      } else {
        warn('Invalid selection, skipping.');
      }
    }
  } catch (e) {
    warn(`Could not list sites: ${e instanceof Error ? e.message : 'error'}`);
  }
}

async function configureGaDefault(rl: ReturnType<typeof createInterface>): Promise<void> {
  console.log(chalk.bold('\nGoogle Analytics'));
  try {
    const client = getAdminClient();
    const accounts: { name?: string | null; displayName?: string | null }[] = [];
    for await (const acc of client.listAccountsAsync({})) {
      accounts.push(acc);
    }
    if (accounts.length === 0) {
      warn('No GA accounts accessible. Add the service account email to your GA property in Admin → Account/Property access management.');
      return;
    }
    const properties: { name: string; displayName: string }[] = [];
    for (const acc of accounts) {
      if (!acc.name) continue;
      for await (const prop of client.listPropertiesAsync({ filter: `parent:${acc.name}` })) {
        if (prop.name && prop.displayName) properties.push({ name: prop.name, displayName: prop.displayName });
      }
    }
    if (properties.length === 0) {
      warn('No GA properties found under accessible accounts.');
      return;
    }
    const current = getDefaultProperty();
    console.log('Accessible properties:');
    properties.forEach((p, i) => {
      const marker = p.name === current || `properties/${p.name}` === current ? chalk.green(' (current default)') : '';
      console.log(`  ${i + 1}. ${p.displayName} (${p.name})${marker}`);
    });
    const pick = await ask(rl, 'Default property number (or blank to skip)');
    if (pick) {
      const idx = parseInt(pick, 10) - 1;
      if (idx >= 0 && idx < properties.length) {
        setDefaultProperty(properties[idx].name);
        success(`Default property: ${properties[idx].displayName}`);
      } else {
        warn('Invalid selection, skipping.');
      }
    }
  } catch (e) {
    warn(`Could not list GA properties: ${e instanceof Error ? e.message : 'error'}`);
  }
}
