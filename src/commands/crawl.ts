import { Command } from 'commander';
import chalk from 'chalk';
import { SiteCrawler } from '../lib/crawler.js';
import { formatTable, error, info, success, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import type { CrawlSummary } from '../types/index.js';

function printSummary(summary: CrawlSummary): void {
  console.log(chalk.bold.cyan('\n📊 Crawl Summary\n'));

  // Overview
  const overviewRows = [
    ['Total Pages Crawled', summary.totalPages.toString()],
    ['Broken Links', summary.brokenLinks.length.toString()],
    ['Missing Titles', summary.missingTitles.length.toString()],
    ['Missing Meta Descriptions', summary.missingMetaDescriptions.length.toString()],
    ['Missing H1 Tags', summary.missingH1s.length.toString()],
    ['Missing Alt Text', summary.missingAltText.length.toString()],
    ['Duplicate Titles', summary.duplicateTitles.length.toString()],
  ];
  console.log(formatTable(['Metric', 'Count'], overviewRows));

  // Broken Links
  if (summary.brokenLinks.length > 0) {
    console.log(chalk.bold.red('\n🔗 Broken Links\n'));
    const brokenRows = summary.brokenLinks.slice(0, 20).map(link => [
      link.url.substring(0, 60) + (link.url.length > 60 ? '...' : ''),
      link.status === 0 ? 'Failed' : link.status.toString(),
      link.foundOn.substring(0, 40) + (link.foundOn.length > 40 ? '...' : ''),
    ]);
    console.log(formatTable(['URL', 'Status', 'Found On'], brokenRows));
    if (summary.brokenLinks.length > 20) {
      info(`... and ${summary.brokenLinks.length - 20} more broken links`);
    }
  }

  // Missing Titles
  if (summary.missingTitles.length > 0) {
    console.log(chalk.bold.yellow('\n📝 Missing Title Tags\n'));
    summary.missingTitles.slice(0, 10).forEach(url => {
      console.log(chalk.dim('  •'), url);
    });
    if (summary.missingTitles.length > 10) {
      info(`... and ${summary.missingTitles.length - 10} more pages`);
    }
  }

  // Missing Meta Descriptions
  if (summary.missingMetaDescriptions.length > 0) {
    console.log(chalk.bold.yellow('\n📄 Missing Meta Descriptions\n'));
    summary.missingMetaDescriptions.slice(0, 10).forEach(url => {
      console.log(chalk.dim('  •'), url);
    });
    if (summary.missingMetaDescriptions.length > 10) {
      info(`... and ${summary.missingMetaDescriptions.length - 10} more pages`);
    }
  }

  // Missing H1
  if (summary.missingH1s.length > 0) {
    console.log(chalk.bold.yellow('\n🏷️  Missing H1 Tags\n'));
    summary.missingH1s.slice(0, 10).forEach(url => {
      console.log(chalk.dim('  •'), url);
    });
    if (summary.missingH1s.length > 10) {
      info(`... and ${summary.missingH1s.length - 10} more pages`);
    }
  }

  // Duplicate Titles
  if (summary.duplicateTitles.length > 0) {
    console.log(chalk.bold.yellow('\n🔄 Duplicate Titles\n'));
    summary.duplicateTitles.slice(0, 5).forEach(dup => {
      console.log(chalk.white(`  "${dup.title}"`));
      dup.pages.slice(0, 3).forEach(page => {
        console.log(chalk.dim(`    • ${page}`));
      });
      if (dup.pages.length > 3) {
        console.log(chalk.dim(`    ... and ${dup.pages.length - 3} more pages`));
      }
    });
    if (summary.duplicateTitles.length > 5) {
      info(`... and ${summary.duplicateTitles.length - 5} more duplicate titles`);
    }
  }

  // Missing Alt Text
  if (summary.missingAltText.length > 0) {
    console.log(chalk.bold.yellow('\n🖼️  Images Missing Alt Text\n'));
    const uniquePages = [...new Set(summary.missingAltText.map(m => m.page))];
    info(`${summary.missingAltText.length} images across ${uniquePages.length} pages`);
    uniquePages.slice(0, 5).forEach(page => {
      const count = summary.missingAltText.filter(m => m.page === page).length;
      console.log(chalk.dim(`  • ${page} (${count} images)`));
    });
    if (uniquePages.length > 5) {
      info(`... and ${uniquePages.length - 5} more pages`);
    }
  }

  // Score
  console.log(chalk.bold.cyan('\n📈 SEO Health Score\n'));
  const totalIssues =
    summary.brokenLinks.length +
    summary.missingTitles.length +
    summary.missingMetaDescriptions.length +
    summary.missingH1s.length +
    summary.duplicateTitles.length;

  const score = Math.max(0, 100 - (totalIssues / summary.totalPages) * 20);
  const scoreColor = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;

  console.log(`  ${scoreColor.bold(Math.round(score).toString() + '/100')}`);
  console.log(chalk.dim(`  Based on ${summary.totalPages} pages and ${totalIssues} issues found\n`));
}

export function createCrawlCommand(): Command {
  const crawl = new Command('crawl')
    .description('Crawl a website for SEO issues')
    .argument('<url>', 'URL to crawl')
    .option('-d, --depth <number>', 'Maximum crawl depth', '3')
    .option('-l, --limit <number>', 'Maximum pages to crawl', '100')
    .option('-c, --concurrency <number>', 'Concurrent requests', '5')
    .option('-r, --rate <number>', 'Max requests per second', '10')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .action(async (url, options) => {
      try {
        // Validate and normalize URL
        const validation = validateUrl(url);
        if (!validation.valid) {
          error(`Invalid URL: ${validation.error}`);
          process.exit(1);
        }
        url = validation.url!;

        const depth = parseInt(options.depth, 10);
        const limit = parseInt(options.limit, 10);
        const concurrency = parseInt(options.concurrency, 10);
        const requestsPerSecond = parseInt(options.rate, 10);

        info(`Starting crawl of ${url}`);
        info(`Depth: ${depth}, Max pages: ${limit}, Concurrency: ${concurrency}, Rate: ${requestsPerSecond}/s\n`);

        let lastUpdate = Date.now();
        const crawler = new SiteCrawler(url, {
          maxDepth: depth,
          maxPages: limit,
          concurrency,
          requestsPerSecond,
          onProgress: (crawled, queued) => {
            const now = Date.now();
            if (now - lastUpdate > 1000) {
              process.stdout.write(`\r  Crawled: ${crawled} | Queued: ${queued}    `);
              lastUpdate = now;
            }
          },
        });

        const results = await crawler.crawl();
        process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear progress line

        success(`Crawl complete! Analyzed ${results.length} pages.\n`);

        const summary = crawler.generateSummary(results);

        if (options.format === 'json') {
          console.log(JSON.stringify({
            url,
            crawledAt: new Date().toISOString(),
            summary: {
              totalPages: summary.totalPages,
              brokenLinksCount: summary.brokenLinks.length,
              missingTitlesCount: summary.missingTitles.length,
              missingMetaDescriptionsCount: summary.missingMetaDescriptions.length,
              missingH1sCount: summary.missingH1s.length,
              missingAltTextCount: summary.missingAltText.length,
              duplicateTitlesCount: summary.duplicateTitles.length,
            },
            issues: {
              brokenLinks: summary.brokenLinks,
              missingTitles: summary.missingTitles,
              missingMetaDescriptions: summary.missingMetaDescriptions,
              missingH1s: summary.missingH1s,
              missingAltText: summary.missingAltText,
              duplicateTitles: summary.duplicateTitles,
            },
            pages: results,
          }, null, 2));
        } else {
          printSummary(summary);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : 'Crawl failed');
        process.exit(1);
      }
    });

  return crawl;
}
