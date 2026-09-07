// Build-time data for the landing page, baked into the HTML by loadLandingData().
// Falls back to the committed fixture when the API is unreachable at build time.
import fixture from '@/data/landing-fixture.json' with { type: 'json' };
import { apiBaseUrl, fetchHomeStats, type HomeStats } from './stats.ts';

const FETCH_TIMEOUT_MS = 4000;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const HTTP_URL_PATTERN = /^https?:\/\//i;
// Two slash-like chars ('//host', '/\host') resolve protocol-relative to an
// external origin, so they are not same-origin relative paths.
const PROTOCOL_RELATIVE_PATTERN = /^[/\\][/\\]/;

export interface TeardownPhoto {
  url: string;
  /**
   * `srcset` over the API's pre-computed derivatives (`THUMBNAIL_WIDTHS`),
   * narrowest first, or '' when there is only one width.
   */
  srcset: string;
  alt: string;
}

export interface TeardownSubpart {
  name: string;
  weightG: number | null;
  /** The part's own photograph (`thumbnail_url` from the tree payload), or null. */
  photo: TeardownPhoto | null;
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
 * Join a root-relative API media path (`/uploads/images/...`) onto the API base.
 * Absolute URLs must be http(s); protocol-relative paths and other schemes
 * (`javascript:`, `data:`) are dropped.
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

// Product types imported from the CPV taxonomy carry the code in `name` and the
// human label in `description` ("CPV: 302132" / "Tablet computer"). Hand-authored
// types put the label in `name` and may have no description at all.
const CPV_CODE_PATTERN = /^CPV:\s*\d+$/i;

/** The visitor-facing product-type label, or '' for none (a CPV code with no description). */
function productTypeLabel(productType: Record<string, unknown>): string {
  const name = trimmedString(productType.name);
  if (!CPV_CODE_PATTERN.test(name)) {
    return name;
  }
  return trimmedString(productType.description);
}

/**
 * Build a photo from any payload carrying `thumbnail_url` and `thumbnail_urls`.
 * Every URL passes resolveMediaUrl; null when nothing usable survives.
 */
function toPhoto(node: Record<string, unknown>, alt: string): TeardownPhoto | null {
  const byWidth = Object.entries(asRecord(node.thumbnail_urls))
    .map(
      ([width, candidate]) => [Number(width), resolveMediaUrl(trimmedString(candidate))] as const,
    )
    .filter(([width, candidate]) => Number.isFinite(width) && width > 0 && candidate !== '')
    .sort(([a], [b]) => a - b);
  // `thumbnail_url` is the smallest derivative, or the original when none was generated.
  const url = resolveMediaUrl(trimmedString(node.thumbnail_url)) || byWidth[0]?.[1] || '';
  if (!url) {
    return null;
  }
  const srcset = byWidth.length > 1 ? byWidth.map(([w, u]) => `${u} ${w}w`).join(', ') : '';
  return { url, srcset, alt };
}

function toSubpart(node: Record<string, unknown>): TeardownSubpart {
  const name = trimmedString(node.name);
  return {
    name,
    weightG: finiteOrNull(node.weight_g),
    // The part's name sits beside the image; repeating it in the alt would make a
    // screen reader announce every part twice.
    photo: toPhoto(node, 'Photographed during disassembly'),
  };
}

/**
 * Add each part's fraction of the summed recorded direct-part mass, and rank
 * heaviest first, unweighed parts last (the API returns recording order).
 *
 * Per-unit: the share mirrors the printed `weight_g` and ignores
 * `amount_in_parent`, so a row's bar and its number never disagree.
 * No recorded mass anywhere -> every share is null and no bars render.
 */
function rankedWithShares<T extends { weightG: number | null }>(
  parts: T[],
): (T & { share: number | null })[] {
  const total = parts.reduce((sum, part) => sum + (part.weightG ?? 0), 0);
  return parts
    .map((part) => ({
      ...part,
      share:
        part.weightG !== null && total > 0
          ? Math.round((part.weightG / total) * 1000) / 1000
          : null,
    }))
    .sort((a, b) => (b.weightG ?? -1) - (a.weightG ?? -1));
}

/**
 * Map a `/v1/products/{id}` payload onto the camelCase shape; null without a name.
 *
 * `tree` is the optional `/v1/products/{id}/components/tree` payload. A non-empty
 * array replaces the flat component list and adds one level of children.
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
  const productType = productTypeLabel(asRecord(product.product_type));
  return {
    id: finiteOrNull(product.id) ?? 0,
    name,
    brand: trimmedString(product.brand) || null,
    weightG: finiteOrNull(product.weight_g),
    ...(productType ? { productType } : {}),
    parts: rankedWithShares(parts),
    photos: images
      .map(asRecord)
      // An image row with no derivative still has its original; toPhoto does not look at it.
      .map((image) =>
        toPhoto(
          trimmedString(image.thumbnail_url) ? image : { ...image, thumbnail_url: image.image_url },
          `${name}, photographed during disassembly`,
        ),
      )
      .filter((photo): photo is TeardownPhoto => photo !== null),
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
    // The fixture stores parts without shares.
    teardown: { ...fixture.teardown, parts: rankedWithShares(fixture.teardown.parts) },
    stats,
    fromFixture: true,
  };
}
