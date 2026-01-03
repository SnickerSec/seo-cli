import { Command } from 'commander';
import * as cheerio from 'cheerio';
import { error, success, info, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import Table from 'cli-table3';
import chalk from 'chalk';

interface SchemaObject {
  type: string;
  source: 'json-ld' | 'microdata' | 'rdfa';
  data: Record<string, unknown>;
  issues: string[];
}

interface OpenGraphData {
  [key: string]: string;
}

interface TwitterCardData {
  [key: string]: string;
}

interface SchemaResult {
  url: string;
  schemas: SchemaObject[];
  openGraph: OpenGraphData;
  twitterCard: TwitterCardData;
  issues: string[];
}

function extractJsonLd(html: string): SchemaObject[] {
  const $ = cheerio.load(html);
  const schemas: SchemaObject[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (!content) return;

      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        const schema: SchemaObject = {
          type: item['@type'] || 'Unknown',
          source: 'json-ld',
          data: item,
          issues: [],
        };

        // Validate common schema types
        validateSchema(schema);
        schemas.push(schema);
      }
    } catch (e) {
      schemas.push({
        type: 'Invalid JSON-LD',
        source: 'json-ld',
        data: {},
        issues: [`JSON parse error: ${e instanceof Error ? e.message : 'Unknown error'}`],
      });
    }
  });

  return schemas;
}

function extractMicrodata(html: string): SchemaObject[] {
  const $ = cheerio.load(html);
  const schemas: SchemaObject[] = [];

  $('[itemscope]').each((_, el) => {
    const $el = $(el);
    const itemtype = $el.attr('itemtype') || '';
    const type = itemtype.split('/').pop() || 'Unknown';

    const data: Record<string, unknown> = {
      '@type': type,
      '@itemtype': itemtype,
    };

    // Extract itemprops
    $el.find('[itemprop]').each((_, propEl) => {
      const $prop = $(propEl);
      const propName = $prop.attr('itemprop');
      if (!propName) return;

      let value: string | undefined;
      if ($prop.attr('content')) {
        value = $prop.attr('content');
      } else if ($prop.attr('href')) {
        value = $prop.attr('href');
      } else if ($prop.attr('src')) {
        value = $prop.attr('src');
      } else {
        value = $prop.text().trim();
      }

      data[propName] = value;
    });

    const schema: SchemaObject = {
      type,
      source: 'microdata',
      data,
      issues: [],
    };

    validateSchema(schema);
    schemas.push(schema);
  });

  return schemas;
}

function extractOpenGraph(html: string): OpenGraphData {
  const $ = cheerio.load(html);
  const og: OpenGraphData = {};

  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property')?.replace('og:', '');
    const content = $(el).attr('content');
    if (property && content) {
      og[property] = content;
    }
  });

  return og;
}

function extractTwitterCard(html: string): TwitterCardData {
  const $ = cheerio.load(html);
  const twitter: TwitterCardData = {};

  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name')?.replace('twitter:', '');
    const content = $(el).attr('content');
    if (name && content) {
      twitter[name] = content;
    }
  });

  return twitter;
}

function validateSchema(schema: SchemaObject): void {
  const data = schema.data;
  const type = schema.type;

  // Common validations
  if (!data['@type']) {
    schema.issues.push('Missing @type property');
  }

  // Type-specific validations
  switch (type) {
    case 'Article':
    case 'NewsArticle':
    case 'BlogPosting':
      if (!data.headline) schema.issues.push('Missing headline');
      if (!data.author) schema.issues.push('Missing author');
      if (!data.datePublished) schema.issues.push('Missing datePublished');
      if (!data.image) schema.issues.push('Missing image');
      break;

    case 'Product':
      if (!data.name) schema.issues.push('Missing name');
      if (!data.image) schema.issues.push('Missing image');
      if (!data.offers) schema.issues.push('Missing offers (price info)');
      break;

    case 'LocalBusiness':
    case 'Organization':
      if (!data.name) schema.issues.push('Missing name');
      if (!data.address) schema.issues.push('Missing address');
      if (type === 'LocalBusiness' && !data.telephone) {
        schema.issues.push('Missing telephone');
      }
      break;

    case 'Person':
      if (!data.name) schema.issues.push('Missing name');
      break;

    case 'BreadcrumbList':
      if (!data.itemListElement) schema.issues.push('Missing itemListElement');
      break;

    case 'FAQPage':
      if (!data.mainEntity) schema.issues.push('Missing mainEntity (questions)');
      break;

    case 'WebSite':
      if (!data.name) schema.issues.push('Missing name');
      if (!data.url) schema.issues.push('Missing url');
      break;

    case 'WebPage':
      if (!data.name) schema.issues.push('Missing name');
      break;
  }
}

function analyzeSchemas(result: SchemaResult): string[] {
  const issues: string[] = [];

  if (result.schemas.length === 0) {
    issues.push('No structured data found');
  }

  // Check for essential schemas
  const types = result.schemas.map(s => s.type);
  if (!types.includes('WebSite') && !types.includes('Organization') && !types.includes('LocalBusiness')) {
    issues.push('Consider adding Organization or WebSite schema');
  }

  // Check OpenGraph
  if (Object.keys(result.openGraph).length === 0) {
    issues.push('No OpenGraph tags found - needed for social sharing');
  } else {
    if (!result.openGraph.title) issues.push('Missing og:title');
    if (!result.openGraph.description) issues.push('Missing og:description');
    if (!result.openGraph.image) issues.push('Missing og:image');
    if (!result.openGraph.url) issues.push('Missing og:url');
  }

  // Check Twitter Card
  if (Object.keys(result.twitterCard).length === 0) {
    issues.push('No Twitter Card tags found');
  } else {
    if (!result.twitterCard.card) issues.push('Missing twitter:card');
  }

  return issues;
}

async function fetchAndAnalyze(url: string): Promise<SchemaResult> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SEO-CLI/1.0',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  const result: SchemaResult = {
    url,
    schemas: [
      ...extractJsonLd(html),
      ...extractMicrodata(html),
    ],
    openGraph: extractOpenGraph(html),
    twitterCard: extractTwitterCard(html),
    issues: [],
  };

  result.issues = analyzeSchemas(result);

  return result;
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.substring(0, len - 3) + '...';
}

export function createSchemaCommand(): Command {
  const cmd = new Command('schema')
    .description('Extract and validate structured data (JSON-LD, OpenGraph, Twitter Cards)')
    .argument('<url>', 'URL to analyze')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option('-r, --raw', 'Show raw schema data', false)
    .action(async (url: string, options) => {
      try {
        if (!validateUrl(url)) {
          error('Invalid URL provided');
          process.exit(1);
        }

        info(`Analyzing structured data for ${url}...`);
        const result = await fetchAndAnalyze(url);

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Display results
        console.log();

        // JSON-LD Schemas
        const jsonLdSchemas = result.schemas.filter(s => s.source === 'json-ld');
        const microdataSchemas = result.schemas.filter(s => s.source === 'microdata');

        if (jsonLdSchemas.length > 0) {
          success(`Found ${jsonLdSchemas.length} JSON-LD schema(s)`);
          const table = new Table({
            head: ['Type', 'Key Fields', 'Issues'],
            style: { head: ['cyan'] },
            colWidths: [25, 45, 30],
          });

          for (const schema of jsonLdSchemas) {
            const keyFields = Object.keys(schema.data)
              .filter(k => !k.startsWith('@'))
              .slice(0, 5)
              .join(', ');

            table.push([
              schema.type,
              truncate(keyFields, 42),
              schema.issues.length > 0
                ? chalk.yellow(schema.issues.join('; '))
                : chalk.green('Valid'),
            ]);
          }
          console.log(table.toString());

          if (options.raw) {
            console.log(chalk.bold('\nRaw JSON-LD Data:'));
            for (const schema of jsonLdSchemas) {
              console.log(chalk.cyan(`\n${schema.type}:`));
              console.log(JSON.stringify(schema.data, null, 2));
            }
          }
        } else {
          warn('No JSON-LD structured data found');
        }

        if (microdataSchemas.length > 0) {
          console.log();
          info(`Found ${microdataSchemas.length} Microdata schema(s)`);
          for (const schema of microdataSchemas) {
            console.log(`  - ${schema.type}`);
          }
        }

        // OpenGraph
        console.log(chalk.bold('\nOpenGraph Tags:'));
        if (Object.keys(result.openGraph).length > 0) {
          const ogTable = new Table({
            head: ['Property', 'Value'],
            style: { head: ['cyan'] },
            colWidths: [20, 70],
          });
          for (const [key, value] of Object.entries(result.openGraph)) {
            ogTable.push([`og:${key}`, truncate(value, 67)]);
          }
          console.log(ogTable.toString());
        } else {
          console.log(chalk.gray('  None found'));
        }

        // Twitter Card
        console.log(chalk.bold('\nTwitter Card Tags:'));
        if (Object.keys(result.twitterCard).length > 0) {
          const twTable = new Table({
            head: ['Property', 'Value'],
            style: { head: ['cyan'] },
            colWidths: [20, 70],
          });
          for (const [key, value] of Object.entries(result.twitterCard)) {
            twTable.push([`twitter:${key}`, truncate(value, 67)]);
          }
          console.log(twTable.toString());
        } else {
          console.log(chalk.gray('  None found'));
        }

        // Issues
        if (result.issues.length > 0) {
          console.log(chalk.bold('\nRecommendations:'));
          for (const issue of result.issues) {
            console.log(`  ${chalk.yellow('•')} ${issue}`);
          }
        } else {
          console.log(chalk.green('\n✓ Structured data looks good'));
        }

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to analyze structured data');
        process.exit(1);
      }
    });

  return cmd;
}
