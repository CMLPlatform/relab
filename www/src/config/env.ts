// Env-variable helpers for src/config/public.ts, which reads `import.meta.env`
// (Vite/Astro `PUBLIC_*`) at build time. astro.config.ts also routes Node
// `process.env` through here, so keep this module dependency-free.

export type EnvSource = Record<string, string | undefined>;

export function getOptional(env: EnvSource, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

export function getRequired(env: EnvSource, key: string, label = 'env var'): string {
  const value = getOptional(env, key);
  if (!value) {
    throw new Error(`Missing required ${label}: ${key}`);
  }
  return value;
}
