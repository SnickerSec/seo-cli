# seo-cli

All-in-one SEO command-line tool for Google Analytics, Search Console, PageSpeed Insights, site crawling, uptime monitoring, and backlink analysis.

## Features

- **Google Analytics 4** - Query reports, real-time data, export
- **Google Search Console** - Search performance, URL inspection, sitemaps
- **PageSpeed Insights** - Core Web Vitals, performance scores
- **Site Crawler** - Find broken links, missing meta tags, SEO issues
- **UptimeRobot** - Monitor website uptime and response times
- **Moz API** - Domain authority, backlinks, spam score

## Installation

```bash
npm install
npm run build
npm link  # Makes 'seo-cli' available globally
```

## Quick Start

```bash
# Configure Google service account (for GA & GSC)
seo-cli auth --key-file ./service-account.json

# Run PageSpeed analysis
seo-cli speed run example.com

# Crawl a site for SEO issues
seo-cli crawl example.com

# Check domain authority (requires Moz API)
seo-cli moz auth --id <access-id> --secret <secret-key>
seo-cli moz check example.com

# Monitor uptime (requires UptimeRobot API)
seo-cli uptime auth --api-key <key>
seo-cli uptime status
```

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

## Commands

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

## Command Reference

| Command | Description |
|---------|-------------|
| `seo-cli auth` | Configure Google service account |
| `seo-cli status` | Show authentication status |
| **PageSpeed** | |
| `seo-cli speed run <url>` | Analyze page performance |
| `seo-cli speed auth` | Set API key (optional) |
| **Crawler** | |
| `seo-cli crawl <url>` | Crawl site for SEO issues |
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
