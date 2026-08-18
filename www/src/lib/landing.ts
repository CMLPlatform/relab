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

export interface TeardownPhoto {
  url: string;
  /**
   * `srcset` over the API's pre-computed derivatives, narrowest first, or ''
   * when there is only one width to offer. The plates render well above the
   * 200px `thumbnail_url` on any high-density screen, and the wider files are
   * already written at upload time (`THUMBNAIL_WIDTHS`), so letting the browser
   * pick beats either upscaling the small one or shipping the large one to
   * everybody.
   */
  srcset: string;
  alt: string;
}

export interface TeardownSubpart {
  name: string;
  weightG: number | null;
  /**
   * The part's own photograph, or null when it has none. Every component in
   * the tree payload already carries `thumbnail_url` (ProductReadBase ->
   * ThumbnailFields), so the parts grid is live data, not authored artwork.
   */
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

// Product types imported from the CPV taxonomy carry the code in `name` and the
// human label in `description` ("CPV: 302132" / "Tablet computer"). Hand-authored
// types put the label in `name` and may have no description at all.
const CPV_CODE_PATTERN = /^CPV:\s*\d+$/i;

/**
 * The visitor-facing product-type label, or '' for none.
 *
 * A bare CPV code tells a visitor nothing, so it never reaches the hero: the
 * imported description takes its place, and a coded type with no description
 * drops the tag rather than printing the code.
 */
function productTypeLabel(productType: Record<string, unknown>): string {
  const name = trimmedString(productType.name);
  if (!CPV_CODE_PATTERN.test(name)) {
    return name;
  }
  return trimmedString(productType.description);
}

/**
 * Build a photo from any payload carrying `thumbnail_url` and `thumbnail_urls`.
 *
 * Every URL goes through the same resolver and the same rejections, so a
 * server-supplied `javascript:` or protocol-relative path drops out here rather
 * than reaching an `img`. Returns null when nothing usable survives, which
 * renders as a blank plate.
 */
function toPhoto(node: Record<string, unknown>, alt: string): TeardownPhoto | null {
  const byWidth = Object.entries(asRecord(node.thumbnail_urls))
    .map(
      ([width, candidate]) => [Number(width), resolveMediaUrl(trimmedString(candidate))] as const,
    )
    .filter(([width, candidate]) => Number.isFinite(width) && width > 0 && candidate !== '')
    .sort(([a], [b]) => a - b);
  // `thumbnail_url` is the smallest derivative, or the original when none was
  // generated; either way it is the right default for a browser ignoring srcset.
  const url = resolveMediaUrl(trimmedString(node.thumbnail_url)) || byWidth[0]?.[1] || '';
  if (!url) {
    return null;
  }
  // One width is not a choice, so do not make the browser parse a candidate list.
  const srcset = byWidth.length > 1 ? byWidth.map(([w, u]) => `${u} ${w}w`).join(', ') : '';
  return { url, srcset, alt };
}

function toSubpart(node: Record<string, unknown>): TeardownSubpart {
  const name = trimmedString(node.name);
  return {
    name,
    weightG: finiteOrNull(node.weight_g),
    // The part's name sits right beside the image (and inside the same
    // <summary> for grouped parts), so naming it again in the alt would make a
    // screen reader announce every part twice. The assembly print keeps the
    // full alt because nothing adjacent names it.
    photo: toPhoto(node, 'Photographed during disassembly'),
  };
}

/**
 * Add each part's fraction of the summed recorded direct-part mass, and rank
 * the parts by that mass.
 *
 * Per-unit: the bar mirrors the printed `weight_g` and ignores
 * `amount_in_parent`, so a row's bar and its number never disagree.
 * No recorded mass anywhere -> every share is null and no bars render.
 *
 * Heaviest first, unweighed parts last. The API returns components in the order
 * they were recorded, which is roughly the order they came off the bench —
 * meaningful, but not what a mass breakdown wants: product 464 lists three
 * screws before its battery, so the hero led with 0.33 g of hardware and the
 * bars scattered. Ranked, the bars read as one descending distribution, and the
 * parts the hero has room for are the ones that account for the mass. Shares
 * stay fractions of the whole product, so a truncated view still tells the
 * truth about what it shows.
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
      // An image row that generated no derivative still has its original, which
      // toPhoto does not look at, so fall back to it here rather than dropping
      // the photograph entirely.
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
    // The fixture stores parts without shares so its masses stay the single
    // source of truth; compute the shares here like the live path does.
    teardown: { ...fixture.teardown, parts: rankedWithShares(fixture.teardown.parts) },
    stats,
    fromFixture: true,
  };
}
