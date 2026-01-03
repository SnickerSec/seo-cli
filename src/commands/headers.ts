import { Command } from 'commander';
import { error, success, info, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import Table from 'cli-table3';
import chalk from 'chalk';

interface SecurityHeader {
  name: string;
  value: string | null;
  status: 'good' | 'warning' | 'missing' | 'info';
  recommendation?: string;
}

interface HeadersResult {
  url: string;
  statusCode: number;
  securityScore: number;
  securityHeaders: SecurityHeader[];
  cacheHeaders: SecurityHeader[];
  seoHeaders: SecurityHeader[];
  allHeaders: Record<string, string>;
}

const SECURITY_HEADERS = [
  {
    name: 'Strict-Transport-Security',
    alias: 'HSTS',
    required: true,
    check: (value: string | null) => {
      if (!value) return { status: 'missing' as const, recommendation: 'Add HSTS header to enforce HTTPS' };
      if (!value.includes('max-age=')) return { status: 'warning' as const, recommendation: 'HSTS should include max-age directive' };
      const maxAge = parseInt(value.match(/max-age=(\d+)/)?.[1] || '0');
      if (maxAge < 31536000) return { status: 'warning' as const, recommendation: 'HSTS max-age should be at least 1 year (31536000)' };
      return { status: 'good' as const };
    },
  },
  {
    name: 'Content-Security-Policy',
    alias: 'CSP',
    required: true,
    check: (value: string | null) => {
      if (!value) return { status: 'missing' as const, recommendation: 'Add CSP header to prevent XSS attacks' };
      if (value.includes("'unsafe-inline'") || value.includes("'unsafe-eval'")) {
        return { status: 'warning' as const, recommendation: 'CSP contains unsafe directives' };
      }
      return { status: 'good' as const };
    },
  },
  {
    name: 'X-Content-Type-Options',
    alias: 'X-CTO',
    required: true,
    check: (value: string | null) => {
      if (!value) return { status: 'missing' as const, recommendation: 'Add X-Content-Type-Options: nosniff' };
      if (value.toLowerCase() !== 'nosniff') return { status: 'warning' as const, recommendation: 'Value should be "nosniff"' };
      return { status: 'good' as const };
    },
  },
  {
    name: 'X-Frame-Options',
    alias: 'XFO',
    required: true,
    check: (value: string | null) => {
      if (!value) return { status: 'missing' as const, recommendation: 'Add X-Frame-Options to prevent clickjacking' };
      const valid = ['deny', 'sameorigin'];
      if (!valid.includes(value.toLowerCase())) return { status: 'warning' as const, recommendation: 'Value should be DENY or SAMEORIGIN' };
      return { status: 'good' as const };
    },
  },
  {
    name: 'X-XSS-Protection',
    alias: 'X-XSS',
    required: false,
    check: (value: string | null) => {
      if (!value) return { status: 'info' as const, recommendation: 'Consider adding (though CSP is preferred)' };
      return { status: 'good' as const };
    },
  },
  {
    name: 'Referrer-Policy',
    alias: 'RP',
    required: true,
    check: (value: string | null) => {
      if (!value) return { status: 'missing' as const, recommendation: 'Add Referrer-Policy header' };
      const secure = ['no-referrer', 'strict-origin', 'strict-origin-when-cross-origin', 'same-origin'];
      if (!secure.includes(value.toLowerCase())) return { status: 'warning' as const, recommendation: 'Consider a more restrictive policy' };
      return { status: 'good' as const };
    },
  },
  {
    name: 'Permissions-Policy',
    alias: 'PP',
    required: false,
    check: (value: string | null) => {
      if (!value) return { status: 'info' as const, recommendation: 'Consider adding to control browser features' };
      return { status: 'good' as const };
    },
  },
];

const CACHE_HEADERS = [
  {
    name: 'Cache-Control',
    check: (value: string | null): { status: 'info' | 'good'; recommendation?: string } => {
      if (!value) return { status: 'info', recommendation: 'Add Cache-Control for better performance' };
      return { status: 'good' };
    },
  },
  {
    name: 'ETag',
    check: (value: string | null): { status: 'info' | 'good'; recommendation?: string } => {
      if (!value) return { status: 'info', recommendation: 'Add ETag for cache validation' };
      return { status: 'good' };
    },
  },
  {
    name: 'Last-Modified',
    check: (value: string | null): { status: 'info' | 'good'; recommendation?: string } => {
      if (!value) return { status: 'info', recommendation: 'Add Last-Modified for cache validation' };
      return { status: 'good' };
    },
  },
  {
    name: 'Vary',
    check: (value: string | null): { status: 'info' | 'good'; recommendation?: string } => {
      if (!value) return { status: 'info' };
      return { status: 'good' };
    },
  },
];

const SEO_HEADERS = [
  {
    name: 'X-Robots-Tag',
    check: (value: string | null) => {
      if (!value) return { status: 'info' as const, recommendation: 'Not present (robots.txt/meta tags used instead)' };
      if (value.includes('noindex')) return { status: 'warning' as const, recommendation: 'Page is set to noindex via header' };
      return { status: 'good' as const };
    },
  },
  {
    name: 'Link',
    check: (value: string | null) => {
      if (!value) return { status: 'info' as const };
      if (value.includes('rel="canonical"')) return { status: 'good' as const, recommendation: 'Canonical URL set via header' };
      return { status: 'info' as const };
    },
  },
];

async function fetchHeaders(url: string): Promise<HeadersResult> {
  const result: HeadersResult = {
    url,
    statusCode: 0,
    securityScore: 0,
    securityHeaders: [],
    cacheHeaders: [],
    seoHeaders: [],
    allHeaders: {},
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'SEO-CLI/1.0',
      },
      redirect: 'follow',
    });

    result.statusCode = response.status;

    // Collect all headers
    response.headers.forEach((value, name) => {
      result.allHeaders[name] = value;
    });

    // Check security headers
    let securityPoints = 0;
    let maxPoints = 0;
    for (const header of SECURITY_HEADERS) {
      const value = response.headers.get(header.name);
      const check = header.check(value);
      result.securityHeaders.push({
        name: header.name,
        value,
        status: check.status,
        recommendation: check.recommendation,
      });
      if (header.required) {
        maxPoints += 1;
        if (check.status === 'good') securityPoints += 1;
        else if (check.status === 'warning') securityPoints += 0.5;
      }
    }
    result.securityScore = Math.round((securityPoints / maxPoints) * 100);

    // Check cache headers
    for (const header of CACHE_HEADERS) {
      const value = response.headers.get(header.name);
      const check = header.check(value);
      result.cacheHeaders.push({
        name: header.name,
        value,
        status: check.status,
        recommendation: check.recommendation,
      });
    }

    // Check SEO headers
    for (const header of SEO_HEADERS) {
      const value = response.headers.get(header.name);
      const check = header.check(value);
      result.seoHeaders.push({
        name: header.name,
        value,
        status: check.status,
        recommendation: check.recommendation,
      });
    }

  } catch (e) {
    throw new Error(`Failed to fetch: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  return result;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'good': return chalk.green('✓');
    case 'warning': return chalk.yellow('⚠');
    case 'missing': return chalk.red('✗');
    case 'info': return chalk.blue('ℹ');
    default: return ' ';
  }
}

function getScoreColor(score: number): (text: string) => string {
  if (score >= 80) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

export function createHeadersCommand(): Command {
  const cmd = new Command('headers')
    .description('Check HTTP security and cache headers')
    .argument('<url>', 'URL to analyze')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option('-a, --all', 'Show all headers', false)
    .action(async (url: string, options) => {
      try {
        if (!validateUrl(url)) {
          error('Invalid URL provided');
          process.exit(1);
        }

        info(`Checking headers for ${url}...`);
        const result = await fetchHeaders(url);

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Display results
        console.log();
        if (result.statusCode >= 200 && result.statusCode < 300) {
          success(`Status: ${result.statusCode}`);
        } else {
          warn(`Status: ${result.statusCode}`);
        }

        // Security score
        const scoreColor = getScoreColor(result.securityScore);
        console.log(`\n${chalk.bold('Security Score:')} ${scoreColor(result.securityScore + '/100')}`);

        // Security headers table
        console.log(chalk.bold('\nSecurity Headers:'));
        const secTable = new Table({
          head: ['', 'Header', 'Value', 'Status'],
          style: { head: ['cyan'] },
          colWidths: [3, 28, 40, 30],
        });

        for (const header of result.securityHeaders) {
          const valueDisplay = header.value
            ? (header.value.length > 37 ? header.value.substring(0, 37) + '...' : header.value)
            : chalk.gray('(not set)');
          secTable.push([
            getStatusIcon(header.status),
            header.name,
            valueDisplay,
            header.recommendation || (header.status === 'good' ? chalk.green('OK') : ''),
          ]);
        }
        console.log(secTable.toString());

        // Cache headers table
        console.log(chalk.bold('\nCache Headers:'));
        const cacheTable = new Table({
          head: ['', 'Header', 'Value'],
          style: { head: ['cyan'] },
          colWidths: [3, 20, 60],
        });

        for (const header of result.cacheHeaders) {
          const valueDisplay = header.value
            ? (header.value.length > 57 ? header.value.substring(0, 57) + '...' : header.value)
            : chalk.gray('(not set)');
          cacheTable.push([
            getStatusIcon(header.status),
            header.name,
            valueDisplay,
          ]);
        }
        console.log(cacheTable.toString());

        // SEO headers
        console.log(chalk.bold('\nSEO Headers:'));
        const seoTable = new Table({
          head: ['', 'Header', 'Value', 'Note'],
          style: { head: ['cyan'] },
          colWidths: [3, 20, 40, 30],
        });

        for (const header of result.seoHeaders) {
          const valueDisplay = header.value
            ? (header.value.length > 37 ? header.value.substring(0, 37) + '...' : header.value)
            : chalk.gray('(not set)');
          seoTable.push([
            getStatusIcon(header.status),
            header.name,
            valueDisplay,
            header.recommendation || '',
          ]);
        }
        console.log(seoTable.toString());

        // All headers
        if (options.all) {
          console.log(chalk.bold('\nAll Headers:'));
          const allTable = new Table({
            head: ['Header', 'Value'],
            style: { head: ['cyan'] },
          });
          for (const [name, value] of Object.entries(result.allHeaders)) {
            allTable.push([name, value.length > 80 ? value.substring(0, 80) + '...' : value]);
          }
          console.log(allTable.toString());
        }

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to check headers');
        process.exit(1);
      }
    });

  return cmd;
}
