import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ExpoPlugin = string | [string, Record<string, unknown>];
const HTTPS_API_URL_PATTERN = /^API_PUBLIC_URL='?https:\/\//m;
const HTTPS_WEBSITE_URL_PATTERN = /^WEB_PUBLIC_URL='?https:\/\//m;
const HTTPS_DOCS_URL_PATTERN = /^DOCS_PUBLIC_URL='?https:\/\//m;

const appConfig = JSON.parse(readFileSync(resolve(__dirname, '../../app.json'), 'utf8')) as {
  expo: {
    android?: Record<string, unknown>;
    ios?: { config?: Record<string, unknown> };
    plugins?: ExpoPlugin[];
  };
};

function pluginConfig(name: string): Record<string, unknown> {
  const plugin = appConfig.expo.plugins?.find((entry) =>
    Array.isArray(entry) ? entry[0] === name : entry === name,
  );
  if (!Array.isArray(plugin)) return {};
  return plugin[1];
}

function readRootEnv(name: string): string {
  return readFileSync(resolve(__dirname, `../../../${name}`), 'utf8');
}

describe('mobile app security configuration', () => {
  it('declares least-privilege native permissions for image capture and selection', () => {
    expect(appConfig.expo.android?.allowBackup).toBe(false);
    expect(appConfig.expo.ios?.config?.usesNonExemptEncryption).toBe(false);

    expect(pluginConfig('expo-secure-store')).toEqual({ configureAndroidBackup: true });
    expect(pluginConfig('expo-image-picker')).toMatchObject({
      cameraPermission: expect.stringContaining('product photos'),
      photosPermission: expect.stringContaining('product photos'),
      microphonePermission: false,
    });
  });

  it('keeps production-like public service URLs on HTTPS', () => {
    for (const envName of ['deploy/env/prod.compose.env', 'deploy/env/staging.compose.env']) {
      const env = readRootEnv(envName);

      expect(env).toMatch(HTTPS_API_URL_PATTERN);
      expect(env).toMatch(HTTPS_WEBSITE_URL_PATTERN);
      expect(env).toMatch(HTTPS_DOCS_URL_PATTERN);
    }
  });
});
