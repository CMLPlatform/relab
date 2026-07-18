// Build-time data for the landing page. Astro calls loadLandingData() during
// the build and bakes the result into the HTML, so the hero paints instantly
// with real content and needs no JS. If the API is unreachable at build time
// (e.g. CI without network access to it) we fall back to a committed fixture
// so the build never fails and the hero is never empty.
import fixture from '@/data/landing-fixture.json' with { type: 'json' };
import { apiBaseUrl, fetchHomeStats, type HomeStats } from './stats.ts';

const FETCH_TIMEOUT_MS = 4000;

export interface TeardownPart {
  name: string;
  weightG: number | null;
}

export interface TeardownPhoto {
  url: string;
  alt: string;
}

export interface FeaturedTeardown {
  id: number;
  name: string;
  brand: string | null;
  weightG: number | null;
  parts: TeardownPart[];
  photos: TeardownPhoto[];
}

export interface LandingData {
  teardown: FeaturedTeardown | null;
  stats: HomeStats | null;
  /** True when the API was unreachable and the committed fixture was used. */
  fromFixture: boolean;
}

function featuredProductId(): number | null {
  const raw = import.meta.env.PUBLIC_FEATURED_PRODUCT_ID?.trim();
  const id = Number(raw);
  return raw && Number.isInteger(id) && id > 0 ? id : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Map a `/v1/products/{id}` payload (ProductReadWithRelationshipsAndFlatComponents)
 * onto our camelCase shape. Returns null when the payload has no usable name,
 * which is the one field the hero cannot render without.
 */
export function parseTeardown(raw: unknown): FeaturedTeardown | null {
  const product = asRecord(raw);
  const name = trimmedString(product.name);
  if (!name) {
    return null;
  }
  const components = Array.isArray(product.components) ? product.components : [];
  const images = Array.isArray(product.images) ? product.images : [];
  return {
    id: finiteOrNull(product.id) ?? 0,
    name,
    brand: trimmedString(product.brand) || null,
    weightG: finiteOrNull(product.weight_g),
    parts: components
      .map(asRecord)
      .filter((component) => trimmedString(component.name))
      .map((component) => ({
        name: trimmedString(component.name),
        weightG: finiteOrNull(component.weight_g),
      })),
    photos: images
      .map(asRecord)
      .map((image) => ({
        url: trimmedString(image.thumbnail_url) || trimmedString(image.image_url),
        alt: `${name}, photographed during disassembly`,
      }))
      .filter((photo) => photo.url !== ''),
  };
}

/** Load the landing payload at build time. Never throws. */
export async function loadLandingData(): Promise<LandingData> {
  const base = apiBaseUrl();
  const id = featuredProductId();
  const stats = await fetchHomeStats();

  if (base && id) {
    try {
      const response = await fetch(`${base}/v1/products/${id}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) {
        const teardown = parseTeardown(await response.json());
        if (teardown) {
          return { teardown, stats, fromFixture: false };
        }
      }
    } catch {
      // Fall through to the fixture below.
    }
  }

  // biome-ignore lint/suspicious/noConsole: diagnostic when the API is unreachable at build time
  console.warn('[landing] API unavailable at build time — using the committed fixture.');
  return { teardown: fixture.teardown, stats, fromFixture: true };
}
