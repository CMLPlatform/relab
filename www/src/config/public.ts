import { type EnvSource, getOptional } from './env.ts';

interface PublicSiteConfig {
  appUrl: string;
  contactEmail: string;
  docsUrl: string;
  siteUrl: string;
}

const LABEL = 'public env var';

let cachedConfig: PublicSiteConfig | undefined;

function validateHttpUrl(value: string, key: string): string {
  const trimmedValue = value.trim();
  try {
    const url = new URL(trimmedValue);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return trimmedValue;
    }
  } catch {
    // Fall through to the shared error below.
  }
  throw new Error(`${key} must be an http(s) URL`);
}

export function readSiteUrl(env: EnvSource, fallback: string): string {
  const value = getOptional(env, 'PUBLIC_SITE_URL') ?? fallback;
  return validateHttpUrl(value, 'PUBLIC_SITE_URL');
}

// These are committed public identity (deploy/env/prod.compose.env), not
// secrets, so an unset build falls back to production rather than failing:
// the site only needs them for outbound links.
const DEFAULTS = {
  PUBLIC_APP_URL: 'https://app.cml-relab.org',
  PUBLIC_DOCS_URL: 'https://docs.cml-relab.org',
  PUBLIC_SITE_URL: 'https://cml-relab.org',
} as const;

export function readPublicSiteConfig(env: EnvSource): PublicSiteConfig {
  const read = (key: keyof typeof DEFAULTS): string =>
    validateHttpUrl(getOptional(env, key) ?? DEFAULTS[key], key);
  return {
    appUrl: read('PUBLIC_APP_URL'),
    docsUrl: read('PUBLIC_DOCS_URL'),
    contactEmail: getOptional(env, 'PUBLIC_CONTACT_EMAIL') ?? 'relab@cml.leidenuniv.nl',
    siteUrl: read('PUBLIC_SITE_URL'),
  };
}

export function getPublicSiteConfig(): PublicSiteConfig {
  cachedConfig ??= readPublicSiteConfig(import.meta.env);
  return cachedConfig;
}

export type { PublicSiteConfig };
