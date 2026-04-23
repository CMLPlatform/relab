// Shared env-variable helpers.
//
// Two call sites currently use these:
//   - src/config/public.ts — reads `import.meta.env` (Vite/Astro `PUBLIC_*`) at build time.
//   - config/runtime.ts    — reads Node `process.env` at tooling runtime (Playwright, scripts).
// Keep this module dependency-free so both Node and Astro bundles can import it.

export type EnvSource = Record<string, string | undefined>;

export function getOptional(env: EnvSource, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function getRequired(env: EnvSource, key: string, label = 'env var'): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required ${label}: ${key}`);
  }
  return value;
}
