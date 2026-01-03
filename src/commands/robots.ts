import { Command } from 'commander';
import { error, success, info, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import Table from 'cli-table3';
import chalk from 'chalk';

interface RobotsRule {
  userAgent: string;
  rules: { type: 'allow' | 'disallow'; path: string }[];
  crawlDelay?: number;
}

interface RobotsResult {
  url: string;
  exists: boolean;
  sitemaps: string[];
  rules: RobotsRule[];
  issues: string[];
}

function parseRobotsTxt(content: string): { rules: RobotsRule[]; sitemaps: string[] } {
  const lines = content.split('\n').map(line => line.trim());
  const rules: RobotsRule[] = [];
  const sitemaps: string[] = [];
  let currentRule: RobotsRule | null = null;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line === '') continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    switch (directive) {
      case 'user-agent':
        if (currentRule) {
          rules.push(currentRule);
        }
        currentRule = { userAgent: value, rules: [] };
        break;
      case 'allow':
        if (currentRule) {
          currentRule.rules.push({ type: 'allow', path: value });
        }
        break;
      case 'disallow':
        if (currentRule) {
          currentRule.rules.push({ type: 'disallow', path: value });
        }
        break;
      case 'crawl-delay':
        if (currentRule) {
          const delay = parseFloat(value);
          if (!isNaN(delay)) {
            currentRule.crawlDelay = delay;
          }
        }
        break;
      case 'sitemap':
        sitemaps.push(value);
        break;
    }
  }

  if (currentRule) {
    rules.push(currentRule);
  }

  return { rules, sitemaps };
}

function analyzeRobots(result: RobotsResult): string[] {
  const issues: string[] = [];

  if (!result.exists) {
    issues.push('robots.txt file not found - all crawlers allowed by default');
    return issues;
  }

  if (result.rules.length === 0) {
    issues.push('No user-agent rules defined');
  }

  // Check for blocking all crawlers
  const allBotsRule = result.rules.find(r => r.userAgent === '*');
  if (allBotsRule) {
    const blockAll = allBotsRule.rules.some(r => r.type === 'disallow' && r.path === '/');
    const allowRoot = allBotsRule.rules.some(r => r.type === 'allow' && r.path === '/');
    if (blockAll && !allowRoot) {
      issues.push('WARNING: All crawlers are blocked from the entire site');
    }
  }

  // Check for Googlebot-specific rules
  const googlebotRule = result.rules.find(r =>
    r.userAgent.toLowerCase().includes('googlebot')
  );
  if (googlebotRule) {
    const blockAll = googlebotRule.rules.some(r => r.type === 'disallow' && r.path === '/');
    if (blockAll) {
      issues.push('WARNING: Googlebot is blocked from the entire site');
    }
  }

  // Check for sitemap
  if (result.sitemaps.length === 0) {
    issues.push('No sitemap declared in robots.txt');
  }

  // Check for common issues
  for (const rule of result.rules) {
    if (rule.crawlDelay && rule.crawlDelay > 10) {
      issues.push(`High crawl-delay (${rule.crawlDelay}s) for ${rule.userAgent} may slow indexing`);
    }

    // Check for blocking important paths
    for (const r of rule.rules) {
      if (r.type === 'disallow') {
        if (r.path === '/wp-admin' || r.path === '/admin') {
          // This is fine, actually good practice
        } else if (r.path.includes('css') || r.path.includes('js')) {
          issues.push(`Blocking CSS/JS (${r.path}) may hurt rendering`);
        } else if (r.path.includes('image') || r.path.includes('img')) {
          issues.push(`Blocking images (${r.path}) may hurt image search visibility`);
        }
      }
    }
  }

  return issues;
}

async function fetchRobotsTxt(url: string): Promise<RobotsResult> {
  const baseUrl = new URL(url);
  const robotsUrl = `${baseUrl.protocol}//${baseUrl.host}/robots.txt`;

  const result: RobotsResult = {
    url: robotsUrl,
    exists: false,
    sitemaps: [],
    rules: [],
    issues: [],
  };

  try {
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'SEO-CLI/1.0',
      },
    });

    if (response.status === 200) {
      const content = await response.text();
      result.exists = true;
      const parsed = parseRobotsTxt(content);
      result.rules = parsed.rules;
      result.sitemaps = parsed.sitemaps;
    } else if (response.status === 404) {
      result.exists = false;
    } else {
      result.issues.push(`Unexpected status code: ${response.status}`);
    }
  } catch (e) {
    result.issues.push(`Failed to fetch: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  result.issues.push(...analyzeRobots(result));
  return result;
}

export function createRobotsCommand(): Command {
  const cmd = new Command('robots')
    .description('Analyze robots.txt file')
    .argument('<url>', 'URL to analyze')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .action(async (url: string, options) => {
      try {
        if (!validateUrl(url)) {
          error('Invalid URL provided');
          process.exit(1);
        }

        info(`Fetching robots.txt for ${url}...`);
        const result = await fetchRobotsTxt(url);

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Display results
        console.log();
        if (result.exists) {
          success(`robots.txt found at ${result.url}`);
        } else {
          warn(`robots.txt not found at ${result.url}`);
        }

        // Sitemaps
        if (result.sitemaps.length > 0) {
          console.log(chalk.bold('\nSitemaps declared:'));
          for (const sitemap of result.sitemaps) {
            console.log(`  ${chalk.cyan(sitemap)}`);
          }
        }

        // Rules table
        if (result.rules.length > 0) {
          console.log(chalk.bold('\nRules:'));
          const table = new Table({
            head: ['User-Agent', 'Type', 'Path', 'Crawl-Delay'],
            style: { head: ['cyan'] },
          });

          for (const rule of result.rules) {
            if (rule.rules.length === 0) {
              table.push([rule.userAgent, '-', '-', rule.crawlDelay?.toString() || '-']);
            } else {
              for (let i = 0; i < rule.rules.length; i++) {
                const r = rule.rules[i];
                table.push([
                  i === 0 ? rule.userAgent : '',
                  r.type === 'allow' ? chalk.green('Allow') : chalk.red('Disallow'),
                  r.path || '(empty)',
                  i === 0 ? (rule.crawlDelay?.toString() || '-') : '',
                ]);
              }
            }
          }
          console.log(table.toString());
        }

        // Issues
        if (result.issues.length > 0) {
          console.log(chalk.bold('\nIssues:'));
          for (const issue of result.issues) {
            if (issue.startsWith('WARNING')) {
              console.log(`  ${chalk.red('⚠')} ${issue}`);
            } else {
              console.log(`  ${chalk.yellow('•')} ${issue}`);
            }
          }
        } else {
          console.log(chalk.green('\n✓ No issues found'));
        }

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to analyze robots.txt');
        process.exit(1);
      }
    });

  return cmd;
}
