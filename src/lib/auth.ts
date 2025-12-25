import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Config } from '../types/index.js';

const CONFIG_DIR = join(homedir(), '.seo-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
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
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
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

  const config = loadConfig();
  config.keyFilePath = keyFilePath;
  saveConfig(config);
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
