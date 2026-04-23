import { type EnvSource, getOptional, getRequired } from './env.ts';

interface PublicSiteConfig {
  appUrl: string;
  apiUrl: string;
  contactEmail: string;
  docsUrl: string;
  linkedInUrl?: string;
  siteUrl: string;
}

const LABEL = 'public env var';

let cachedConfig: PublicSiteConfig | undefined;

export function readSiteUrl(env: EnvSource, fallback?: string): string {
  return getOptional(env, 'SITE_URL') ?? getOptional(env, 'PUBLIC_SITE_URL') ?? fallback ?? '';
}

export function readPublicSiteConfig(env: EnvSource): PublicSiteConfig {
  return {
    apiUrl: getRequired(env, 'PUBLIC_API_URL', LABEL),
    appUrl: getRequired(env, 'PUBLIC_APP_URL', LABEL),
    docsUrl: getRequired(env, 'PUBLIC_DOCS_URL', LABEL),
    linkedInUrl: getOptional(env, 'PUBLIC_LINKEDIN_URL'),
    contactEmail: getOptional(env, 'PUBLIC_CONTACT_EMAIL') ?? 'relab@cml.leidenuniv.nl',
    siteUrl: getRequired(env, 'PUBLIC_SITE_URL', LABEL),
  };
}

export function getPublicSiteConfig(): PublicSiteConfig {
  cachedConfig ??= readPublicSiteConfig(import.meta.env);
  return cachedConfig;
}

export type { PublicSiteConfig };
