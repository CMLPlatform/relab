// Build-time data for the landing page. Astro calls loadLandingData() during
// the build and bakes the result into the HTML, so the hero paints instantly
// with real content and needs no JS. If the API is unreachable at build time
// (e.g. CI without network access to it) we fall back to a committed fixture
// so the build never fails and the hero is never empty.
import fixture from '@/data/landing-fixture.json' with { type: 'json' };
import { apiBaseUrl, fetchHomeStats, type HomeStats } from './stats.ts';

const FETCH_TIMEOUT_MS = 4000;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const HTTP_URL_PATTERN = /^https?:\/\//i;
// Two slash-like chars ('//host', '/\host') resolve protocol-relative to an
// external origin, so they are not same-origin relative paths.
const PROTOCOL_RELATIVE_PATTERN = /^[/\\][/\\]/;

export interface TeardownSubpart {
  name: string;
  weightG: number | null;
}

export interface TeardownPart extends TeardownSubpart {
  /**
   * This part's fraction (0..1) of the summed recorded mass of all direct
   * parts, rounded to 3 decimals; null when the part (or every part) has no
   * recorded mass. Drives the CSS mass bars.
   */
  share: number | null;
  /** Direct subcomponents (one level), present only when there are any. */
  children?: TeardownSubpart[];
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
  productType?: string;
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
 * Turn an API media path into a URL the visitor's browser can actually load.
 *
 * The API serves images as root-relative paths (`/uploads/images/...`) which
 * would 404 on the www origin, so they are joined onto the API base. Absolute
 * URLs must be http(s): a protocol-relative `//host` path or any other scheme
 * (`javascript:`, `data:`) is server-supplied and gets dropped, not rendered.
 */
function resolveMediaUrl(path: string): string {
  if (!path || PROTOCOL_RELATIVE_PATTERN.test(path)) {
    return '';
  }
  if (URL_SCHEME_PATTERN.test(path)) {
    return HTTP_URL_PATTERN.test(path) ? path : '';
  }
  return `${apiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
}

function toSubpart(node: Record<string, unknown>): TeardownSubpart {
  return { name: trimmedString(node.name), weightG: finiteOrNull(node.weight_g) };
}

/**
 * Add each part's fraction of the summed recorded direct-part mass.
 *
 * Per-unit: the bar mirrors the printed `weight_g` and ignores
 * `amount_in_parent`, so a row's bar and its number never disagree.
 * No recorded mass anywhere -> every share is null and no bars render.
 */
function withShares<T extends { weightG: number | null }>(
  parts: T[],
): (T & { share: number | null })[] {
  const total = parts.reduce((sum, part) => sum + (part.weightG ?? 0), 0);
  return parts.map((part) => ({
    ...part,
    share:
      part.weightG !== null && total > 0 ? Math.round((part.weightG / total) * 1000) / 1000 : null,
  }));
}

/**
 * Map a `/v1/products/{id}` payload (ProductReadWithRelationshipsAndFlatComponents)
 * onto our camelCase shape. Returns null when the payload has no usable name,
 * which is the one field the hero cannot render without.
 *
 * `tree` is the optional `/v1/products/{id}/components/tree` payload; when it
 * is a usable non-empty array its top level replaces the flat component list
 * and contributes one nested level of children. Any other shape is ignored.
 */
export function parseTeardown(raw: unknown, tree: unknown = null): FeaturedTeardown | null {
  const product = asRecord(raw);
  const name = trimmedString(product.name);
  if (!name) {
    return null;
  }
  const treeNodes = Array.isArray(tree)
    ? tree.map(asRecord).filter((node) => trimmedString(node.name))
    : [];
  const parts: Omit<TeardownPart, 'share'>[] =
    treeNodes.length > 0
      ? treeNodes.map((node) => {
          const children = (Array.isArray(node.components) ? node.components : [])
            .map(asRecord)
            .filter((child) => trimmedString(child.name))
            .map(toSubpart);
          return { ...toSubpart(node), ...(children.length > 0 ? { children } : {}) };
        })
      : (Array.isArray(product.components) ? product.components : [])
          .map(asRecord)
          .filter((component) => trimmedString(component.name))
          .map(toSubpart);
  const images = Array.isArray(product.images) ? product.images : [];
  const productType = trimmedString(asRecord(product.product_type).name);
  return {
    id: finiteOrNull(product.id) ?? 0,
    name,
    brand: trimmedString(product.brand) || null,
    weightG: finiteOrNull(product.weight_g),
    ...(productType ? { productType } : {}),
    parts: withShares(parts),
    photos: images
      .map(asRecord)
      .map((image) => ({
        url: resolveMediaUrl(trimmedString(image.thumbnail_url) || trimmedString(image.image_url)),
        alt: `${name}, photographed during disassembly`,
      }))
      .filter((photo) => photo.url !== ''),
  };
}

/**
 * Fetch the featured product's component tree (one child level). Best-effort:
 * any failure degrades the hero to the flat component list, never the fixture.
 */
async function fetchComponentTree(base: string, id: number): Promise<unknown> {
  try {
    const response = await fetch(`${base}/v1/products/${id}/components/tree?recursion_depth=2`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
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
        const teardown = parseTeardown(await response.json(), await fetchComponentTree(base, id));
        if (teardown) {
          return { teardown, stats, fromFixture: false };
        }
      }
    } catch {
      // Fall through to the fixture below.
    }
    // biome-ignore lint/suspicious/noConsole: diagnostic when the API is unreachable at build time
    console.warn('[landing] API unavailable at build time; using the committed fixture.');
  } else {
    // biome-ignore lint/suspicious/noConsole: expected on builds without a featured product
    console.info('[landing] no featured product configured; using the committed fixture.');
  }

  return {
    // The fixture stores parts without shares so its masses stay the single
    // source of truth; compute the shares here like the live path does.
    teardown: { ...fixture.teardown, parts: withShares(fixture.teardown.parts) },
    stats,
    fromFixture: true,
  };
}
