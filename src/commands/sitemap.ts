import { Command } from 'commander';
import { error, success, info, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import Table from 'cli-table3';
import chalk from 'chalk';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

interface SitemapIndex {
  loc: string;
  lastmod?: string;
}

interface SitemapResult {
  url: string;
  type: 'sitemap' | 'sitemapindex' | 'unknown';
  exists: boolean;
  urlCount: number;
  urls: SitemapUrl[];
  sitemaps: SitemapIndex[];
  issues: string[];
  validUrls: number;
  invalidUrls: string[];
}

function parseXml(content: string): { urls: SitemapUrl[]; sitemaps: SitemapIndex[]; type: 'sitemap' | 'sitemapindex' | 'unknown' } {
  const urls: SitemapUrl[] = [];
  const sitemaps: SitemapIndex[] = [];
  let type: 'sitemap' | 'sitemapindex' | 'unknown' = 'unknown';

  // Check if it's a sitemap index
  if (content.includes('<sitemapindex')) {
    type = 'sitemapindex';
    // Extract sitemap entries
    const sitemapMatches = content.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi);
    for (const match of sitemapMatches) {
      const sitemapContent = match[1];
      const loc = sitemapContent.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]?.trim();
      const lastmod = sitemapContent.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
      if (loc) {
        sitemaps.push({ loc, lastmod });
      }
    }
  } else if (content.includes('<urlset')) {
    type = 'sitemap';
    // Extract URL entries
    const urlMatches = content.matchAll(/<url>([\s\S]*?)<\/url>/gi);
    for (const match of urlMatches) {
      const urlContent = match[1];
      const loc = urlContent.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]?.trim();
      const lastmod = urlContent.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
      const changefreq = urlContent.match(/<changefreq>([\s\S]*?)<\/changefreq>/i)?.[1]?.trim();
      const priority = urlContent.match(/<priority>([\s\S]*?)<\/priority>/i)?.[1]?.trim();
      if (loc) {
        urls.push({ loc, lastmod, changefreq, priority });
      }
    }
  }

  return { urls, sitemaps, type };
}

function validateSitemapUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function analyzeSitemap(result: SitemapResult): string[] {
  const issues: string[] = [];

  if (!result.exists) {
    issues.push('Sitemap not found or inaccessible');
    return issues;
  }

  if (result.type === 'unknown') {
    issues.push('File does not appear to be a valid sitemap (missing urlset or sitemapindex)');
    return issues;
  }

  if (result.type === 'sitemap') {
    if (result.urlCount === 0) {
      issues.push('Sitemap contains no URLs');
    } else if (result.urlCount > 50000) {
      issues.push(`Sitemap exceeds 50,000 URL limit (${result.urlCount} URLs)`);
    }

    // Check for missing lastmod
    const withoutLastmod = result.urls.filter(u => !u.lastmod).length;
    if (withoutLastmod > 0) {
      issues.push(`${withoutLastmod} URLs missing lastmod date`);
    }

    // Check for old lastmod dates
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oldUrls = result.urls.filter(u => {
      if (!u.lastmod) return false;
      const date = new Date(u.lastmod);
      return date < oneYearAgo;
    }).length;
    if (oldUrls > result.urlCount * 0.5) {
      issues.push(`${oldUrls} URLs have lastmod older than 1 year`);
    }

    // Check for invalid priority values
    const invalidPriority = result.urls.filter(u => {
      if (!u.priority) return false;
      const p = parseFloat(u.priority);
      return isNaN(p) || p < 0 || p > 1;
    }).length;
    if (invalidPriority > 0) {
      issues.push(`${invalidPriority} URLs have invalid priority (should be 0.0-1.0)`);
    }

    // Check for invalid changefreq
    const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
    const invalidFreq = result.urls.filter(u => {
      if (!u.changefreq) return false;
      return !validFreqs.includes(u.changefreq.toLowerCase());
    }).length;
    if (invalidFreq > 0) {
      issues.push(`${invalidFreq} URLs have invalid changefreq`);
    }

    // Report invalid URLs
    if (result.invalidUrls.length > 0) {
      issues.push(`${result.invalidUrls.length} invalid URLs found`);
    }
  }

  if (result.type === 'sitemapindex') {
    if (result.sitemaps.length === 0) {
      issues.push('Sitemap index contains no sitemaps');
    }
  }

  return issues;
}

async function fetchSitemap(url: string, checkUrls: boolean): Promise<SitemapResult> {
  const result: SitemapResult = {
    url,
    type: 'unknown',
    exists: false,
    urlCount: 0,
    urls: [],
    sitemaps: [],
    issues: [],
    validUrls: 0,
    invalidUrls: [],
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SEO-CLI/1.0',
        'Accept': 'application/xml, text/xml, */*',
      },
    });

    if (response.status === 200) {
      const content = await response.text();
      result.exists = true;

      const parsed = parseXml(content);
      result.type = parsed.type;
      result.urls = parsed.urls;
      result.sitemaps = parsed.sitemaps;
      result.urlCount = parsed.urls.length;

      // Validate URLs
      for (const u of result.urls) {
        if (validateSitemapUrl(u.loc)) {
          result.validUrls++;
        } else {
          result.invalidUrls.push(u.loc);
        }
      }

      // Optionally check URL accessibility
      if (checkUrls && result.urls.length > 0) {
        const samplesToCheck = result.urls.slice(0, 5);
        for (const u of samplesToCheck) {
          try {
            const urlResponse = await fetch(u.loc, { method: 'HEAD' });
            if (urlResponse.status >= 400) {
              result.issues.push(`Sample URL returned ${urlResponse.status}: ${u.loc}`);
            }
          } catch {
            result.issues.push(`Sample URL unreachable: ${u.loc}`);
          }
        }
      }
    } else if (response.status === 404) {
      result.exists = false;
    } else {
      result.issues.push(`Unexpected status code: ${response.status}`);
    }
  } catch (e) {
    result.issues.push(`Failed to fetch: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  result.issues.push(...analyzeSitemap(result));
  return result;
}

export function createSitemapCommand(): Command {
  const cmd = new Command('sitemap')
    .description('Validate XML sitemap')
    .argument('<url>', 'Sitemap URL (or website URL to check /sitemap.xml)')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option('-c, --check-urls', 'Check sample URLs for accessibility', false)
    .option('-l, --limit <number>', 'Limit URLs to display', '20')
    .action(async (url: string, options) => {
      try {
        if (!validateUrl(url)) {
          error('Invalid URL provided');
          process.exit(1);
        }

        // If URL doesn't end with .xml, assume it's a site URL
        let sitemapUrl = url;
        if (!url.endsWith('.xml')) {
          const baseUrl = new URL(url);
          sitemapUrl = `${baseUrl.protocol}//${baseUrl.host}/sitemap.xml`;
        }

        info(`Validating sitemap at ${sitemapUrl}...`);
        const result = await fetchSitemap(sitemapUrl, options.checkUrls);

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Display results
        console.log();
        if (result.exists) {
          success(`Sitemap found at ${result.url}`);
          console.log(`Type: ${chalk.cyan(result.type)}`);
        } else {
          warn(`Sitemap not found at ${result.url}`);
          console.log();
          return;
        }

        if (result.type === 'sitemapindex') {
          console.log(`\n${chalk.bold('Sitemaps in index:')} ${result.sitemaps.length}`);
          const table = new Table({
            head: ['Sitemap URL', 'Last Modified'],
            style: { head: ['cyan'] },
          });
          const limit = parseInt(options.limit, 10);
          for (const sitemap of result.sitemaps.slice(0, limit)) {
            table.push([sitemap.loc, sitemap.lastmod || '-']);
          }
          console.log(table.toString());
          if (result.sitemaps.length > limit) {
            console.log(chalk.gray(`  ... and ${result.sitemaps.length - limit} more sitemaps`));
          }
        }

        if (result.type === 'sitemap') {
          console.log(`\n${chalk.bold('URLs:')} ${result.urlCount} (${result.validUrls} valid)`);

          if (result.urls.length > 0) {
            const table = new Table({
              head: ['URL', 'Last Modified', 'Priority', 'Freq'],
              style: { head: ['cyan'] },
              colWidths: [60, 15, 10, 10],
            });
            const limit = parseInt(options.limit, 10);
            for (const u of result.urls.slice(0, limit)) {
              const urlDisplay = u.loc.length > 57 ? u.loc.substring(0, 57) + '...' : u.loc;
              table.push([
                urlDisplay,
                u.lastmod || '-',
                u.priority || '-',
                u.changefreq || '-',
              ]);
            }
            console.log(table.toString());
            if (result.urls.length > limit) {
              console.log(chalk.gray(`  ... and ${result.urls.length - limit} more URLs`));
            }
          }
        }

        // Issues
        if (result.issues.length > 0) {
          console.log(chalk.bold('\nIssues:'));
          for (const issue of result.issues) {
            console.log(`  ${chalk.yellow('•')} ${issue}`);
          }
        } else {
          console.log(chalk.green('\n✓ No issues found'));
        }

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to validate sitemap');
        process.exit(1);
      }
    });

  return cmd;
}
