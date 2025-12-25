export interface Config {
  keyFilePath?: string;
  defaultProperty?: string;
  defaultSite?: string;
  uptimeRobotApiKey?: string;
  mozAccessId?: string;
  mozSecretKey?: string;
  pageSpeedApiKey?: string;
}

export interface ReportOptions {
  property: string;
  metrics: string;
  dimensions?: string;
  startDate: string;
  endDate: string;
  format: 'table' | 'json' | 'csv';
  limit?: number;
}

export interface RealtimeOptions {
  property: string;
  watch?: boolean;
  interval?: number;
}

export interface ExportOptions extends ReportOptions {
  output: string;
}

export interface FormattedRow {
  [key: string]: string | number;
}

export interface SearchConsoleQueryOptions {
  site: string;
  startDate: string;
  endDate: string;
  dimensions?: string;
  format: 'table' | 'json' | 'csv';
  limit?: number;
  type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews';
}

export interface SearchConsoleRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

// PageSpeed Insights types
export interface PageSpeedOptions {
  url: string;
  strategy: 'mobile' | 'desktop';
  format: 'table' | 'json';
}

export interface CoreWebVitals {
  lcp: number | null;  // Largest Contentful Paint (ms)
  fid: number | null;  // First Input Delay (ms)
  cls: number | null;  // Cumulative Layout Shift
  fcp: number | null;  // First Contentful Paint (ms)
  ttfb: number | null; // Time to First Byte (ms)
  inp: number | null;  // Interaction to Next Paint (ms)
}

// Crawler types
export interface CrawlOptions {
  url: string;
  depth: number;
  limit: number;
  format: 'table' | 'json';
  concurrency: number;
}

export interface CrawlResult {
  url: string;
  status: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  issues: string[];
  links: string[];
  images: { src: string; alt: string | null }[];
}

export interface CrawlSummary {
  totalPages: number;
  brokenLinks: { url: string; status: number; foundOn: string }[];
  missingTitles: string[];
  missingMetaDescriptions: string[];
  missingH1s: string[];
  missingAltText: { page: string; image: string }[];
  duplicateTitles: { title: string; pages: string[] }[];
}

// UptimeRobot types
export interface UptimeMonitor {
  id: number;
  friendly_name: string;
  url: string;
  status: number;
  uptime_ratio: string;
  response_time: number;
}

// Moz types
export interface MozMetrics {
  domain_authority: number;
  page_authority: number;
  spam_score: number;
  linking_domains: number;
  inbound_links: number;
}
