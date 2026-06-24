import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, chmodSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';
import type { Config } from '../types/index.js';

const IS_WINDOWS = platform() === 'win32';

const CONFIG_DIR = join(homedir(), '.seo-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig(): Config {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function setKeyFile(keyFilePath: string): void {
  if (!existsSync(keyFilePath)) {
    throw new Error(`Key file not found: ${keyFilePath}`);
  }

  // Validate it's a valid JSON file
  try {
    const content = readFileSync(keyFilePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('Invalid service account key file: missing client_email or private_key');
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid JSON in key file');
    }
    throw e;
  }

  // Tighten permissions to 0600 (owner read/write only) on POSIX platforms.
  if (!IS_WINDOWS) {
    try {
      chmodSync(keyFilePath, 0o600);
    } catch {
      // Non-fatal — surface via checkKeyFilePermissions at runtime.
    }
  }

  const config = loadConfig();
  config.keyFilePath = keyFilePath;
  saveConfig(config);
}

/**
 * Returns a warning string if the key file is world/group readable, else null.
 * Always returns null on Windows (POSIX mode bits don't apply).
 */
export function checkKeyFilePermissions(keyFilePath: string): string | null {
  if (IS_WINDOWS) return null;
  try {
    const mode = statSync(keyFilePath).mode & 0o777;
    if (mode & 0o077) {
      return `Key file permissions are ${mode.toString(8).padStart(3, '0')} (group/world accessible). Run: chmod 600 ${keyFilePath}`;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getKeyFilePath(): string | undefined {
  const config = loadConfig();
  return config.keyFilePath;
}

export function setDefaultProperty(propertyId: string): void {
  const config = loadConfig();
  config.defaultProperty = propertyId;
  saveConfig(config);
}

export function getDefaultProperty(): string | undefined {
  const config = loadConfig();
  return config.defaultProperty;
}

export function setDefaultSite(siteUrl: string): void {
  const config = loadConfig();
  config.defaultSite = siteUrl;
  saveConfig(config);
}

export function getDefaultSite(): string | undefined {
  const config = loadConfig();
  return config.defaultSite;
}

export function requireAuth(): string {
  const keyFilePath = getKeyFilePath();
  if (!keyFilePath) {
    throw new Error(
      'Not authenticated. Run: seo-cli auth --key-file <path-to-service-account.json>'
    );
  }
  if (!existsSync(keyFilePath)) {
    throw new Error(
      `Key file no longer exists at: ${keyFilePath}\nRun: seo-cli auth --key-file <path-to-new-file.json>`
    );
  }
  return keyFilePath;
}

// UptimeRobot API key
export function setUptimeRobotApiKey(apiKey: string): void {
  const config = loadConfig();
  config.uptimeRobotApiKey = apiKey;
  saveConfig(config);
}

export function getUptimeRobotApiKey(): string | undefined {
  const config = loadConfig();
  return config.uptimeRobotApiKey;
}

// Moz API credentials
export function setMozCredentials(accessId: string, secretKey: string): void {
  const config = loadConfig();
  config.mozAccessId = accessId;
  config.mozSecretKey = secretKey;
  saveConfig(config);
}

export function getMozCredentials(): { accessId?: string; secretKey?: string } {
  const config = loadConfig();
  return {
    accessId: config.mozAccessId,
    secretKey: config.mozSecretKey,
  };
}

// PageSpeed API key (optional, for higher quota)
export function setPageSpeedApiKey(apiKey: string): void {
  const config = loadConfig();
  config.pageSpeedApiKey = apiKey;
  saveConfig(config);
}

export function getPageSpeedApiKey(): string | undefined {
  const config = loadConfig();
  return config.pageSpeedApiKey;
}
