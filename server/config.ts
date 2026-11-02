import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AdapterConfig } from './adapters.js';
if (existsSync('.env')) process.loadEnvFile('.env');
export const dataPath = resolve(process.env.OPS_DATA_DIR ?? '.data', 'desk.sqlite');
export const adapterConfig: AdapterConfig = {
  clientId: process.env.GREENHOUSE_CLIENT_ID,
  clientSecret: process.env.GREENHOUSE_CLIENT_SECRET,
  userId: process.env.GREENHOUSE_USER_ID,
  jobIds: process.env.GREENHOUSE_JOB_IDS,
  googleToken: process.env.GOOGLE_CALENDAR_ACCESS_TOKEN,
  calendarId: process.env.GOOGLE_CALENDAR_ID,
};
export const providerKind = process.env.OPS_PROVIDER ?? 'greenhouse';
if (!['greenhouse', 'json-http'].includes(providerKind))
  throw new Error('OPS_PROVIDER must be greenhouse or json-http.');
export const httpProviderConfig = {
  providerUrl: process.env.OPS_PROVIDER_URL,
  providerToken: process.env.OPS_PROVIDER_TOKEN,
};
