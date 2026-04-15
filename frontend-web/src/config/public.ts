type PublicEnv = Record<string, string | undefined>;

export interface PublicSiteConfig {
  appUrl: string;
  apiUrl: string;
  contactEmail: string;
  docsUrl: string;
  linkedInUrl?: string;
  siteUrl: string;
}

function getRequired(env: PublicEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required public env var: ${key}`);
  }
  return value;
}

function getOptional(env: PublicEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function readPublicSiteConfig(env: PublicEnv): PublicSiteConfig {
  return {
    apiUrl: getRequired(env, 'PUBLIC_API_URL'),
    appUrl: getRequired(env, 'PUBLIC_APP_URL'),
    docsUrl: getRequired(env, 'PUBLIC_DOCS_URL'),
    linkedInUrl: getOptional(env, 'PUBLIC_LINKEDIN_URL'),
    contactEmail: getOptional(env, 'PUBLIC_CONTACT_EMAIL') ?? 'relab@cml.leidenuniv.nl',
    siteUrl: getRequired(env, 'PUBLIC_SITE_URL'),
  };
}

let cachedConfig: PublicSiteConfig | undefined;

export function getPublicSiteConfig(): PublicSiteConfig {
  cachedConfig ??= readPublicSiteConfig(import.meta.env);
  return cachedConfig;
}
