import { type EnvSource, getOptional, getRequired } from './env.ts';

interface PublicSiteConfig {
  appUrl: string;
  contactEmail: string;
  docsUrl: string;
  linkedInUrl?: string;
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

export function readSiteUrl(env: EnvSource, fallback?: string): string {
  const value = getOptional(env, 'PUBLIC_SITE_URL') ?? fallback;
  return value ? validateHttpUrl(value, 'PUBLIC_SITE_URL') : '';
}

export function readPublicSiteConfig(env: EnvSource): PublicSiteConfig {
  const linkedInUrl = getOptional(env, 'PUBLIC_LINKEDIN_URL');
  return {
    appUrl: validateHttpUrl(getRequired(env, 'PUBLIC_APP_URL', LABEL), 'PUBLIC_APP_URL'),
    docsUrl: validateHttpUrl(getRequired(env, 'PUBLIC_DOCS_URL', LABEL), 'PUBLIC_DOCS_URL'),
    linkedInUrl: linkedInUrl ? validateHttpUrl(linkedInUrl, 'PUBLIC_LINKEDIN_URL') : undefined,
    contactEmail: getOptional(env, 'PUBLIC_CONTACT_EMAIL') ?? 'relab@cml.leidenuniv.nl',
    siteUrl: validateHttpUrl(getRequired(env, 'PUBLIC_SITE_URL', LABEL), 'PUBLIC_SITE_URL'),
  };
}

export function getPublicSiteConfig(): PublicSiteConfig {
  cachedConfig ??= readPublicSiteConfig(import.meta.env);
  return cachedConfig;
}

export type { PublicSiteConfig };
