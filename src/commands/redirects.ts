import { Command } from 'commander';
import { error, success, info } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import Table from 'cli-table3';
import chalk from 'chalk';

interface RedirectHop {
  url: string;
  statusCode: number;
  location?: string;
  responseTime: number;
}

interface RedirectResult {
  originalUrl: string;
  finalUrl: string;
  redirectCount: number;
  hops: RedirectHop[];
  issues: string[];
  totalTime: number;
}

async function followRedirects(url: string, maxRedirects: number = 10): Promise<RedirectResult> {
  const result: RedirectResult = {
    originalUrl: url,
    finalUrl: url,
    redirectCount: 0,
    hops: [],
    issues: [],
    totalTime: 0,
  };

  let currentUrl = url;
  const visitedUrls = new Set<string>();

  for (let i = 0; i <= maxRedirects; i++) {
    // Check for redirect loops
    if (visitedUrls.has(currentUrl)) {
      result.issues.push(`Redirect loop detected at: ${currentUrl}`);
      break;
    }
    visitedUrls.add(currentUrl);

    const startTime = Date.now();
    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'SEO-CLI/1.0',
        },
        redirect: 'manual', // Don't follow redirects automatically
      });

      const responseTime = Date.now() - startTime;
      result.totalTime += responseTime;

      const hop: RedirectHop = {
        url: currentUrl,
        statusCode: response.status,
        responseTime,
      };

      // Check if it's a redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          hop.location = location;
          result.hops.push(hop);
          result.redirectCount++;

          // Resolve relative URLs
          try {
            currentUrl = new URL(location, currentUrl).href;
          } catch {
            result.issues.push(`Invalid redirect location: ${location}`);
            break;
          }

          // Check redirect type
          if (response.status === 302 || response.status === 307) {
            result.issues.push(`Temporary redirect (${response.status}) at hop ${i + 1} - consider using 301 for SEO`);
          }

          continue;
        } else {
          result.issues.push(`Redirect status ${response.status} but no Location header`);
          result.hops.push(hop);
          break;
        }
      }

      // Not a redirect, we've reached the final destination
      result.hops.push(hop);
      result.finalUrl = currentUrl;

      // Check final status
      if (response.status >= 400) {
        result.issues.push(`Final URL returns error status: ${response.status}`);
      }

      break;

    } catch (e) {
      result.hops.push({
        url: currentUrl,
        statusCode: 0,
        responseTime: Date.now() - startTime,
      });
      result.issues.push(`Failed to fetch ${currentUrl}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      break;
    }
  }

  // Check for too many redirects
  if (result.redirectCount >= maxRedirects) {
    result.issues.push(`Maximum redirects (${maxRedirects}) reached`);
  } else if (result.redirectCount > 2) {
    result.issues.push(`${result.redirectCount} redirects - consider reducing redirect chain`);
  }

  // Check for protocol changes
  const protocols = result.hops.map(h => new URL(h.url).protocol);
  if (protocols.includes('http:') && protocols.includes('https:')) {
    const httpToHttps = result.hops.some((h, i) => {
      if (i === 0) return false;
      const prevProtocol = new URL(result.hops[i - 1].url).protocol;
      const currProtocol = new URL(h.url).protocol;
      return prevProtocol === 'http:' && currProtocol === 'https:';
    });
    if (httpToHttps) {
      // This is good - upgrading to HTTPS
    } else {
      result.issues.push('Redirect chain includes downgrade from HTTPS to HTTP');
    }
  }

  // Check for www/non-www consistency
  const hosts = [...new Set(result.hops.map(h => new URL(h.url).hostname))];
  const wwwHosts = hosts.filter(h => h.startsWith('www.'));
  const nonWwwHosts = hosts.filter(h => !h.startsWith('www.'));
  if (wwwHosts.length > 0 && nonWwwHosts.length > 0) {
    // This is fine if it's a redirect from one to the other
  }

  return result;
}

function getStatusColor(status: number): (text: string) => string {
  if (status >= 200 && status < 300) return chalk.green;
  if (status >= 300 && status < 400) return chalk.yellow;
  if (status >= 400) return chalk.red;
  return chalk.gray;
}

function getStatusEmoji(status: number): string {
  if (status === 200) return '✓';
  if (status === 301) return '→';
  if (status === 302 || status === 307) return '⇢';
  if (status >= 400) return '✗';
  return '?';
}

export function createRedirectsCommand(): Command {
  const cmd = new Command('redirects')
    .description('Follow and analyze redirect chains')
    .argument('<url>', 'URL to check')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option('-m, --max <number>', 'Maximum redirects to follow', '10')
    .action(async (url: string, options) => {
      try {
        if (!validateUrl(url)) {
          error('Invalid URL provided');
          process.exit(1);
        }

        info(`Following redirects for ${url}...`);
        const maxRedirects = parseInt(options.max, 10);
        const result = await followRedirects(url, maxRedirects);

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Display results
        console.log();

        if (result.redirectCount === 0) {
          success('No redirects - URL responds directly');
        } else {
          info(`${result.redirectCount} redirect${result.redirectCount > 1 ? 's' : ''} found`);
        }

        // Redirect chain visualization
        console.log(chalk.bold('\nRedirect Chain:'));
        const table = new Table({
          head: ['#', 'Status', 'URL', 'Time'],
          style: { head: ['cyan'] },
          colWidths: [4, 8, 70, 10],
        });

        for (let i = 0; i < result.hops.length; i++) {
          const hop = result.hops[i];
          const statusColor = getStatusColor(hop.statusCode);
          const emoji = getStatusEmoji(hop.statusCode);
          const urlDisplay = hop.url.length > 67 ? hop.url.substring(0, 67) + '...' : hop.url;

          table.push([
            i + 1,
            statusColor(`${emoji} ${hop.statusCode}`),
            urlDisplay,
            `${hop.responseTime}ms`,
          ]);
        }

        console.log(table.toString());

        // Summary
        console.log(chalk.bold('\nSummary:'));
        console.log(`  Original URL: ${chalk.cyan(result.originalUrl)}`);
        console.log(`  Final URL:    ${chalk.green(result.finalUrl)}`);
        console.log(`  Total hops:   ${result.hops.length}`);
        console.log(`  Total time:   ${result.totalTime}ms`);

        // URL comparison
        if (result.originalUrl !== result.finalUrl) {
          const originalParsed = new URL(result.originalUrl);
          const finalParsed = new URL(result.finalUrl);

          if (originalParsed.protocol !== finalParsed.protocol) {
            console.log(`  Protocol:     ${originalParsed.protocol} → ${chalk.green(finalParsed.protocol)}`);
          }
          if (originalParsed.hostname !== finalParsed.hostname) {
            console.log(`  Host:         ${originalParsed.hostname} → ${chalk.green(finalParsed.hostname)}`);
          }
        }

        // Issues
        if (result.issues.length > 0) {
          console.log(chalk.bold('\nIssues:'));
          for (const issue of result.issues) {
            if (issue.includes('loop') || issue.includes('error') || issue.includes('HTTPS to HTTP')) {
              console.log(`  ${chalk.red('✗')} ${issue}`);
            } else {
              console.log(`  ${chalk.yellow('⚠')} ${issue}`);
            }
          }
        } else {
          console.log(chalk.green('\n✓ No issues found'));
        }

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to follow redirects');
        process.exit(1);
      }
    });

  return cmd;
}
