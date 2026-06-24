import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir, platform } from 'os';
import { join } from 'path';
import { checkKeyFilePermissions } from './auth.js';

const IS_WINDOWS = platform() === 'win32';

describe('checkKeyFilePermissions', () => {
  let dir: string;
  let keyPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'seo-cli-test-'));
    keyPath = join(dir, 'key.json');
    writeFileSync(keyPath, '{}');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(IS_WINDOWS)('returns null when mode is 0600', () => {
    chmodSync(keyPath, 0o600);
    expect(checkKeyFilePermissions(keyPath)).toBeNull();
  });

  it.skipIf(IS_WINDOWS)('warns when group/world bits are set', () => {
    chmodSync(keyPath, 0o644);
    const result = checkKeyFilePermissions(keyPath);
    expect(result).toContain('644');
    expect(result).toContain('chmod 600');
  });

  it.skipIf(IS_WINDOWS)('warns on 0640 (group readable)', () => {
    chmodSync(keyPath, 0o640);
    expect(checkKeyFilePermissions(keyPath)).toContain('640');
  });

  it('returns null for missing files', () => {
    expect(checkKeyFilePermissions(join(dir, 'nope.json'))).toBeNull();
  });
});
