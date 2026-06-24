import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Point HOME at a temp dir so the tracker writes into an isolated location.
let tmp: string;
let originalHome: string | undefined;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'rank-tracker-test-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmp;
  // Reset module cache so rankTracker picks up the new HOME.
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tmp, { recursive: true, force: true });
});

describe('rankTracker', () => {
  it('saves and lists snapshots', async () => {
    const { saveSnapshot, listSnapshots } = await import('./rankTracker.js');
    saveSnapshot({
      site: 'sc-domain:example.com',
      date: '2026-04-01',
      takenAt: new Date().toISOString(),
      rows: [{ query: 'foo', clicks: 10, impressions: 100, ctr: 0.1, position: 5.2 }],
    });
    saveSnapshot({
      site: 'sc-domain:example.com',
      date: '2026-04-08',
      takenAt: new Date().toISOString(),
      rows: [{ query: 'foo', clicks: 12, impressions: 120, ctr: 0.1, position: 3.8 }],
    });
    expect(listSnapshots('sc-domain:example.com')).toEqual(['2026-04-01', '2026-04-08']);
  });

  it('diff labels new/dropped/changed and computes deltas', async () => {
    const { diffSnapshots } = await import('./rankTracker.js');
    const before = {
      site: 's', date: '2026-04-01', takenAt: '',
      rows: [
        { query: 'stable', clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
        { query: 'dropped', clicks: 3, impressions: 50, ctr: 0.06, position: 8 },
      ],
    };
    const after = {
      site: 's', date: '2026-04-08', takenAt: '',
      rows: [
        { query: 'stable', clicks: 15, impressions: 110, ctr: 0.14, position: 3 },
        { query: 'new', clicks: 5, impressions: 40, ctr: 0.12, position: 6 },
      ],
    };
    const diffs = diffSnapshots(before, after);
    const byQuery = Object.fromEntries(diffs.map((d) => [d.query, d]));
    expect(byQuery.stable.status).toBe('changed');
    expect(byQuery.stable.positionDelta).toBe(-2); // improved
    expect(byQuery.stable.clicksDelta).toBe(5);
    expect(byQuery.new.status).toBe('new');
    expect(byQuery.dropped.status).toBe('dropped');
  });

  it('latestSnapshot returns the most recent by date', async () => {
    const { saveSnapshot, latestSnapshot } = await import('./rankTracker.js');
    saveSnapshot({ site: 's', date: '2026-04-01', takenAt: '', rows: [] });
    saveSnapshot({ site: 's', date: '2026-04-08', takenAt: '', rows: [{ query: 'x', clicks: 1, impressions: 1, ctr: 1, position: 1 }] });
    expect(latestSnapshot('s')?.date).toBe('2026-04-08');
  });
});
