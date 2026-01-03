# seo-cli

[![CI](https://github.com/SnickerSec/seo-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/SnickerSec/seo-cli/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SnickerSec/seo-cli/actions/workflows/codeql.yml/badge.svg)](https://github.com/SnickerSec/seo-cli/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

All-in-one SEO command-line tool for comprehensive site analysis, Google Analytics, Search Console, PageSpeed Insights, site crawling, uptime monitoring, and backlink analysis.

## Features

### Site Analysis (No Auth Required)
- **SEO Audit** - Comprehensive audit combining crawl + PageSpeed analysis
- **Competitor Comparison** - Compare SEO metrics across multiple sites
- **Content Analysis** - Readability scores, keyword density, content optimization
- **Site Crawler** - Find broken links, missing meta tags, SEO issues
- **PageSpeed Insights** - Core Web Vitals, performance scores

### Technical SEO
- **Robots.txt Analyzer** - Parse and validate robots.txt rules
- **Sitemap Validator** - Check XML sitemap structure and URLs
- **Security Headers** - Audit HSTS, CSP, X-Frame-Options, and more
- **Redirect Checker** - Follow and analyze redirect chains
- **Schema Validator** - Extract and validate JSON-LD, OpenGraph, Twitter Cards

### Integrations (Auth Required)
- **Google Analytics 4** - Query reports, real-time data, export
- **Google Search Console** - Search performance, URL inspection, sitemaps
- **UptimeRobot** - Monitor website uptime and response times
- **Moz API** - Domain authority, backlinks, spam score
- **Response Caching** - Cache expensive API calls for faster repeat queries

## Installation

```bash
npm install
npm run build
npm link  # Makes 'seo-cli' available globally
```

## Quick Start

```bash
# Run a comprehensive SEO audit
seo-cli audit example.com

# Analyze content readability and keywords
seo-cli content https://example.com/blog-post

# Check security headers
seo-cli headers https://example.com

# Validate robots.txt
seo-cli robots https://example.com

# Check XML sitemap
seo-cli sitemap https://example.com/sitemap.xml

# Follow redirect chain
seo-cli redirects http://example.com

# Extract structured data (JSON-LD, OpenGraph)
seo-cli schema https://example.com

# Compare competitors
seo-cli compare mysite.com competitor1.com competitor2.com

# Run PageSpeed analysis
seo-cli speed run example.com

# Crawl a site for SEO issues
seo-cli crawl example.com
```

---

## Commands

### Content Analysis

Analyze content readability and keyword density.

```bash
# Analyze content
seo-cli content https://example.com/blog-post

# Check specific target keyword placement
seo-cli content https://example.com/blog-post -t "target keyword"

# Show more keywords
seo-cli content https://example.com -k 25

# JSON output
seo-cli content https://example.com -f json
```

**Metrics returned:**
- Word count, sentences, paragraphs
- Flesch Reading Ease score
- Flesch-Kincaid Grade Level
- Gunning Fog Index
- SMOG Index
- Coleman-Liau Index
- Automated Readability Index
- Top keywords with density %
- Top 2-word and 3-word phrases
- Heading structure analysis
- Title/meta description/H1 optimization tips

---

### Robots.txt Analyzer

Parse and analyze robots.txt rules.

```bash
# Analyze robots.txt
seo-cli robots https://example.com

# JSON output
seo-cli robots https://example.com -f json
```

**Checks performed:**
- User-agent rules (Allow/Disallow)
- Crawl-delay directives
- Sitemap declarations
- Blocking issues (Googlebot, all bots)
- CSS/JS/image blocking warnings

---

### Sitemap Validator

Validate XML sitemap structure and URLs.

```bash
# Validate sitemap
seo-cli sitemap https://example.com/sitemap.xml

# Auto-detect sitemap.xml
seo-cli sitemap https://example.com

# Check sample URLs for accessibility
seo-cli sitemap https://example.com -c

# JSON output
seo-cli sitemap https://example.com -f json
```

**Validates:**
- XML structure (urlset/sitemapindex)
- URL count (max 50,000)
- lastmod dates
- changefreq values
- priority values (0.0-1.0)
- URL accessibility (with -c flag)

---

### Security Headers

Check HTTP security and cache headers.

```bash
# Check headers
seo-cli headers https://example.com

# Show all headers
seo-cli headers https://example.com -a

# JSON output
seo-cli headers https://example.com -f json
```

**Security headers checked:**
- Strict-Transport-Security (HSTS)
- Content-Security-Policy (CSP)
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Referrer-Policy
- Permissions-Policy

**Cache headers checked:**
- Cache-Control
- ETag
- Last-Modified
- Vary

**SEO headers checked:**
- X-Robots-Tag
- Link (canonical)

---

### Redirect Checker

Follow and analyze redirect chains.

```bash
# Follow redirects
seo-cli redirects http://example.com

# Set max redirects to follow
seo-cli redirects http://example.com -m 5

# JSON output
seo-cli redirects http://example.com -f json
```

**Analysis includes:**
- Full redirect chain with status codes
- Response time per hop
- Protocol changes (HTTP → HTTPS)
- Redirect type warnings (302 vs 301)
- Loop detection
- Total redirect count

---

### Schema Validator

Extract and validate structured data.

```bash
# Extract structured data
seo-cli schema https://example.com

# Show raw JSON-LD data
seo-cli schema https://example.com -r

# JSON output
seo-cli schema https://example.com -f json
```

**Extracts and validates:**
- JSON-LD schemas (Article, Product, Organization, etc.)
- Microdata
- OpenGraph tags (og:title, og:description, og:image)
- Twitter Card tags

**Type-specific validation:**
- Article: headline, author, datePublished, image
- Product: name, image, offers
- Organization: name, address
- LocalBusiness: name, address, telephone
- FAQPage: mainEntity
- BreadcrumbList: itemListElement

---

### SEO Audit

Run a comprehensive SEO audit combining crawl and PageSpeed analysis.

```bash
# Run audit
seo-cli audit example.com

# Deeper crawl
seo-cli audit example.com --depth 5 --limit 200

# JSON output
seo-cli audit example.com -f json
```

---

### Competitor Comparison

Compare SEO metrics across multiple sites.

```bash
# Compare 2-5 sites
seo-cli compare mysite.com competitor1.com competitor2.com

# JSON output
seo-cli compare site1.com site2.com -f json
```

---

### PageSpeed Insights

Analyze page performance and Core Web Vitals.

```bash
# Run analysis (mobile by default)
seo-cli speed run example.com

# Desktop analysis
seo-cli speed run example.com --strategy desktop

# JSON output
seo-cli speed run example.com --format json
```

**Metrics returned:**
- Performance, Accessibility, Best Practices, SEO scores
- LCP, FID, CLS, FCP, TTFB, INP (Core Web Vitals)

---

### Site Crawler

Crawl your site to find SEO issues.

```bash
# Basic crawl
seo-cli crawl example.com

# Deeper crawl
seo-cli crawl example.com --depth 5 --limit 500

# JSON output
seo-cli crawl example.com --format json
```

**Issues detected:**
- Broken links (404s, 5xx errors)
- Missing title tags
- Missing meta descriptions
- Missing H1 tags
- Missing image alt text
- Duplicate titles

---

### UptimeRobot

Monitor website uptime and get alerts.

```bash
# List all monitors
seo-cli uptime monitors

# Quick status overview
seo-cli uptime status

# Add a new monitor
seo-cli uptime add example.com
seo-cli uptime add example.com --name "My Site" --interval 60

# Manage monitors
seo-cli uptime pause <id>
seo-cli uptime resume <id>
seo-cli uptime delete <id>

# View alert contacts
seo-cli uptime alerts
```

---

### Moz API

Check domain authority and backlink metrics.

```bash
# Get metrics for a URL
seo-cli moz check example.com

# Compare multiple domains
seo-cli moz compare example.com competitor1.com competitor2.com

# JSON output
seo-cli moz check example.com --format json
```

**Metrics returned:**
- Domain Authority (DA)
- Page Authority (PA)
- Spam Score
- Linking root domains
- Total backlinks

---

### Google Analytics

Query analytics data from GA4.

```bash
# List accounts and properties
seo-cli accounts list
seo-cli properties list

# Set default property
seo-cli properties set-default 123456789

# Query reports
seo-cli report -p 123456789 -m sessions,users -d date
seo-cli report -m sessions,pageviews --start-date 30daysAgo

# Real-time data
seo-cli realtime -p 123456789
seo-cli realtime -p 123456789 --watch

# Export data
seo-cli export -p 123456789 -m sessions -d date -o report.csv
```

---

### Google Search Console

Query search performance and manage sitemaps.

```bash
# List verified sites
seo-cli gsc sites

# Set default site
seo-cli gsc set-default https://example.com

# Query search analytics
seo-cli gsc query -s https://example.com -d query,page
seo-cli gsc query --start-date 30daysAgo --end-date today

# URL inspection
seo-cli gsc inspect -s https://example.com -u https://example.com/page

# Sitemaps
seo-cli gsc sitemaps list -s https://example.com
seo-cli gsc sitemaps submit https://example.com/sitemap.xml -s https://example.com
```

---

### Cache Management

Manage the response cache for API calls.

```bash
# View cache status
seo-cli cache status

# Clear all cache
seo-cli cache clear

# Clear specific namespace
seo-cli cache clear --namespace moz
```

---

## Command Reference

| Command | Description |
|---------|-------------|
| `seo-cli auth` | Configure Google service account |
| `seo-cli status` | Show authentication status |
| **Site Analysis** | |
| `seo-cli audit <url>` | Comprehensive SEO audit |
| `seo-cli compare <urls...>` | Compare multiple sites |
| `seo-cli content <url>` | Analyze readability & keywords |
| `seo-cli crawl <url>` | Crawl site for SEO issues |
| **Technical SEO** | |
| `seo-cli robots <url>` | Analyze robots.txt |
| `seo-cli sitemap <url>` | Validate XML sitemap |
| `seo-cli headers <url>` | Check security headers |
| `seo-cli redirects <url>` | Follow redirect chains |
| `seo-cli schema <url>` | Extract structured data |
| **PageSpeed** | |
| `seo-cli speed run <url>` | Analyze page performance |
| `seo-cli speed auth` | Set API key (optional) |
| **UptimeRobot** | |
| `seo-cli uptime auth` | Configure API key |
| `seo-cli uptime monitors` | List monitors |
| `seo-cli uptime status` | Quick status overview |
| `seo-cli uptime add <url>` | Add monitor |
| `seo-cli uptime delete <id>` | Delete monitor |
| **Moz** | |
| `seo-cli moz auth` | Configure API credentials |
| `seo-cli moz check <url>` | Get domain metrics |
| `seo-cli moz compare <urls...>` | Compare domains |
| **Google Analytics** | |
| `seo-cli accounts list` | List GA accounts |
| `seo-cli properties list` | List GA properties |
| `seo-cli report` | Query analytics reports |
| `seo-cli realtime` | View real-time data |
| `seo-cli export` | Export to CSV/JSON |
| **Search Console** | |
| `seo-cli gsc sites` | List verified sites |
| `seo-cli gsc query` | Query search analytics |
| `seo-cli gsc inspect` | Check URL indexing |
| `seo-cli gsc sitemaps` | Manage sitemaps |
| **Cache** | |
| `seo-cli cache status` | View cache statistics |
| `seo-cli cache clear` | Clear cached responses |

---

## Setup

### Google Service Account (for GA & Search Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Analytics Data API**, **Google Analytics Admin API**, and **Search Console API**
3. Create a service account and download the JSON key
4. Add the service account email to:
   - Google Analytics: Admin > Property Access Management
   - Search Console: Settings > Users and permissions

```bash
seo-cli auth --key-file ./service-account.json
```

### UptimeRobot (Free)

1. Create account at [uptimerobot.com](https://uptimerobot.com)
2. Get API key from Dashboard > My Settings

```bash
seo-cli uptime auth --api-key <your-api-key>
```

### Moz API (Free tier: 10 queries/month)

1. Sign up at [moz.com/products/api](https://moz.com/products/api)
2. Get Access ID and Secret Key

```bash
seo-cli moz auth --id <access-id> --secret <secret-key>
```

### PageSpeed API Key (Optional)

For higher rate limits, add a Google API key:

```bash
seo-cli speed auth --api-key <google-api-key>
```

---

## Configuration

All configuration is stored in `~/.seo-cli/config.json`:

```json
{
  "keyFilePath": "/path/to/service-account.json",
  "defaultProperty": "123456789",
  "defaultSite": "https://example.com",
  "uptimeRobotApiKey": "...",
  "mozAccessId": "...",
  "mozSecretKey": "...",
  "pageSpeedApiKey": "..."
}
```

---

## License

MIT
