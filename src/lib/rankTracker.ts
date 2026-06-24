import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

const TRACKER_DIR = join(homedir(), '.seo-cli', 'rank-tracker');

export interface QuerySnapshot {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface Snapshot {
  site: string;
  date: string; // YYYY-MM-DD (the GSC endDate — i.e. the day being reported on)
  takenAt: string; // ISO timestamp of when snapshot was recorded
  rows: QuerySnapshot[];
}

function siteHash(site: string): string {
  return createHash('sha256').update(site).digest('hex').slice(0, 12);
}

function siteDir(site: string): string {
  const dir = join(TRACKER_DIR, siteHash(site));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function saveSnapshot(snapshot: Snapshot): string {
  const dir = siteDir(snapshot.site);
  const path = join(dir, `${snapshot.date}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  return path;
}

export function listSnapshots(site: string): string[] {
  const dir = siteDir(site);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export function loadSnapshot(site: string, date: string): Snapshot | null {
  const path = join(siteDir(site), `${date}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as Snapshot;
}

export function latestSnapshot(site: string): Snapshot | null {
  const dates = listSnapshots(site);
  if (dates.length === 0) return null;
  return loadSnapshot(site, dates[dates.length - 1]);
}

export interface QueryDiff {
  query: string;
  positionBefore: number | null;
  positionAfter: number | null;
  positionDelta: number | null; // negative = improved (lower position = better)
  clicksBefore: number;
  clicksAfter: number;
  clicksDelta: number;
  impressionsBefore: number;
  impressionsAfter: number;
  impressionsDelta: number;
  status: 'new' | 'dropped' | 'changed';
}

export function diffSnapshots(before: Snapshot, after: Snapshot): QueryDiff[] {
  const beforeMap = new Map(before.rows.map((r) => [r.query, r]));
  const afterMap = new Map(after.rows.map((r) => [r.query, r]));
  const queries = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  const diffs: QueryDiff[] = [];
  for (const query of queries) {
    const b = beforeMap.get(query);
    const a = afterMap.get(query);
    const status: QueryDiff['status'] = !b ? 'new' : !a ? 'dropped' : 'changed';
    diffs.push({
      query,
      positionBefore: b?.position ?? null,
      positionAfter: a?.position ?? null,
      positionDelta: b && a ? +(a.position - b.position).toFixed(2) : null,
      clicksBefore: b?.clicks ?? 0,
      clicksAfter: a?.clicks ?? 0,
      clicksDelta: (a?.clicks ?? 0) - (b?.clicks ?? 0),
      impressionsBefore: b?.impressions ?? 0,
      impressionsAfter: a?.impressions ?? 0,
      impressionsDelta: (a?.impressions ?? 0) - (b?.impressions ?? 0),
      status,
    });
  }
  return diffs;
}
