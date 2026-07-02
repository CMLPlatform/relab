// Fetch of the public system stats shown on the homepage.
//
// Called from the browser by src/scripts/stats.ts. The site CSP allows the API
// origin via CADDY_API_ORIGIN (matching the app/docs frontends), and the API
// already allows the www origin in its CORS list. On any failure the caller
// leaves the stats panel hidden.

const DEV_API_URL = 'http://127.0.0.1:8010';
const FETCH_TIMEOUT_MS = 4000;
const CATEGORY_LIMIT = 6;

interface Totals {
  teardowns: number;
  parts: number;
  mass_kg: number;
  images: number;
  users: number;
}

interface CategoryStat {
  name: string;
  teardowns: number;
  parts: number;
}

export interface HomeStats {
  totals: Totals;
  categories: CategoryStat[];
  generatedAt: string;
}

function apiBaseUrl(): string {
  return import.meta.env.PUBLIC_API_URL?.trim() || DEV_API_URL;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Fetch homepage stats. Returns null on any failure. */
export async function fetchHomeStats(): Promise<HomeStats | null> {
  const raw = apiBaseUrl();
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  try {
    const [totals, categories] = await Promise.all([
      getJson<{ totals: Totals; generated_at: string }>(`${base}/v1/stats/totals`),
      getJson<{ categories: CategoryStat[] }>(
        `${base}/v1/stats/categories?limit=${CATEGORY_LIMIT}`,
      ),
    ]);
    return {
      totals: totals.totals,
      categories: categories.categories,
      generatedAt: totals.generated_at,
    };
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: diagnostic when the stats API is unreachable
    console.warn(`[stats] skipping homepage stats: ${(error as Error).message}`);
    return null;
  }
}

// --- Pure presentation helpers (unit-tested) ---

const groupedFormat = new Intl.NumberFormat('en-US');

/** Group thousands, e.g. 18300 -> "18,300". */
export function formatCount(value: number): string {
  return groupedFormat.format(Math.round(value));
}

/** Show mass in tonnes once it clears a tonne, otherwise kilograms. */
export function formatMass(massKg: number): { value: string; unit: string } {
  if (massKg >= 1000) {
    return { value: (massKg / 1000).toFixed(massKg >= 10000 ? 0 : 1), unit: 't' };
  }
  return { value: formatCount(massKg), unit: 'kg' };
}

/** Bar width as a percentage, floored so the smallest category stays visible. */
export function barPercent(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.round((value / max) * 88) + 12;
}
