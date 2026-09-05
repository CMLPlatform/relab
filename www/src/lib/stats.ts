// Fetch of the public system stats shown on the homepage.
//
// Called from the browser by src/scripts/stats.ts. The site CSP allows the API
// origin via CADDY_API_ORIGIN (matching the app/docs frontends), and the API
// already allows the www origin in its CORS list. On any failure the caller
// leaves the stats panel hidden.

const DEV_API_URL = 'http://127.0.0.1:8010';
const FETCH_TIMEOUT_MS = 4000;

/** Months of history shown in the activity chart. */
export const SERIES_MONTHS = 12;

interface Totals {
  teardowns: number;
  parts: number;
  mass_kg: number;
  images: number;
  users: number;
}

/** One month of activity. Mirrors the `/v1/stats/series` SeriesPoint schema. */
export interface SeriesPoint {
  period: string;
  teardowns: number;
  parts: number;
  mass_kg: number;
  images: number;
}

export interface HomeStats {
  totals: Totals;
  series: SeriesPoint[];
  generatedAt: string;
}

/** Backend base URL without a trailing slash, or '' when it is not configured. */
export function apiBaseUrl(): string {
  // Only dev builds fall back to the local backend; a prod build without
  // PUBLIC_API_URL should skip the fetch instead of hitting the visitor's
  // own localhost.
  const raw = import.meta.env.PUBLIC_API_URL?.trim() || (import.meta.env.DEV ? DEV_API_URL : '');
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return (await response.json()) as T;
}

/** The last `count` month keys ending with the current month, as `YYYY-MM`. */
export function monthKeys(count: number, now: Date = new Date()): string[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * Expand an API series onto every month in `keys`.
 *
 * The API omits periods with no activity entirely, so a quiet month is absent
 * rather than zero. Plotting the raw response would compress the x-axis and
 * misstate when the activity happened.
 */
export function zeroFillSeries(series: SeriesPoint[], keys: string[]): SeriesPoint[] {
  const byPeriod = new Map(series.map((point) => [point.period, point]));
  return keys.map(
    (period) => byPeriod.get(period) ?? { period, teardowns: 0, parts: 0, mass_kg: 0, images: 0 },
  );
}

// Single-flight cache: BrandHero and StatsPanel both call fetchHomeStats() on
// page load. Without this they'd double the HTTP requests and could land on
// different backend cache generations, making the hero line and panel tiles
// disagree on the same paint. A failed (null) fetch is cached too, so both
// consumers agree; a page reload gets a fresh attempt.
let cached: Promise<HomeStats | null> | null = null;

/** Fetch homepage stats. Returns null on any failure. Memoized per page load. */
export function fetchHomeStats(): Promise<HomeStats | null> {
  cached ??= fetchHomeStatsUncached();
  return cached;
}

/** Test-only: clear the single-flight cache between tests. */
export function resetStatsCacheForTests(): void {
  cached = null;
}

async function fetchHomeStatsUncached(): Promise<HomeStats | null> {
  const base = apiBaseUrl();
  if (!base) {
    return null;
  }
  const keys = monthKeys(SERIES_MONTHS);
  const start = `${keys[0]}-01`;
  const end = new Date().toISOString().slice(0, 10);
  try {
    const [totals, series] = await Promise.all([
      getJson<{ totals: Totals; generated_at: string }>(`${base}/v1/stats/totals`),
      getJson<{ series: SeriesPoint[] }>(
        `${base}/v1/stats/series?granularity=month&start=${start}&end=${end}`,
      ),
    ]);
    // Guard against shape drift in the API: a missing field would otherwise
    // render as the literal string "NaN" in the revealed panel.
    const t = totals.totals;
    if (![t?.teardowns, t?.parts, t?.mass_kg, t?.images, t?.users].every(Number.isFinite)) {
      throw new Error('unexpected totals shape');
    }
    if (Number.isNaN(new Date(totals.generated_at).getTime())) {
      throw new Error('unexpected totals shape');
    }
    const points = (series.series ?? []).filter((p) =>
      [p?.teardowns, p?.parts, p?.mass_kg, p?.images].every(Number.isFinite),
    );
    return {
      totals: t,
      series: zeroFillSeries(points, keys),
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

/**
 * Build a y-axis with a round step (1/2/5 x 10^n) so ticks never collide once
 * formatted. `integer` forces a whole-number step, so a max of 2 yields 0,1,2
 * rather than 0,0.5,1,1.5,2, which would round to a duplicated "0,1,1,2,2".
 */
export function buildScale(max: number, integer: boolean): { yMax: number; ticks: number[] } {
  const rawStep = max / 4 || 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiple = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = integer ? Math.max(1, Math.round(multiple * magnitude)) : multiple * magnitude;
  const yMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= yMax + step / 1000; tick += step) {
    ticks.push(tick);
  }
  return { yMax, ticks };
}
