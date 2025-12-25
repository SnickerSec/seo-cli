import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { google, searchconsole_v1 } from 'googleapis';
import { requireAuth } from './auth.js';

let dataClient: BetaAnalyticsDataClient | null = null;
let adminClient: AnalyticsAdminServiceClient | null = null;
let searchConsoleClient: searchconsole_v1.Searchconsole | null = null;

export function getDataClient(): BetaAnalyticsDataClient {
  if (!dataClient) {
    const keyFilePath = requireAuth();
    dataClient = new BetaAnalyticsDataClient({
      keyFilename: keyFilePath,
    });
  }
  return dataClient;
}

export function getAdminClient(): AnalyticsAdminServiceClient {
  if (!adminClient) {
    const keyFilePath = requireAuth();
    adminClient = new AnalyticsAdminServiceClient({
      keyFilename: keyFilePath,
    });
  }
  return adminClient;
}

export function formatPropertyId(propertyId: string): string {
  // Ensure property ID is in the correct format: properties/XXXXXX
  if (propertyId.startsWith('properties/')) {
    return propertyId;
  }
  return `properties/${propertyId}`;
}

export function extractPropertyNumber(propertyId: string): string {
  // Extract just the number from properties/XXXXXX
  return propertyId.replace('properties/', '');
}

export function getSearchConsoleClient(): searchconsole_v1.Searchconsole {
  if (!searchConsoleClient) {
    const keyFilePath = requireAuth();
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: [
        'https://www.googleapis.com/auth/webmasters.readonly',
        'https://www.googleapis.com/auth/webmasters',
      ],
    });
    searchConsoleClient = google.searchconsole({ version: 'v1', auth });
  }
  return searchConsoleClient;
}
