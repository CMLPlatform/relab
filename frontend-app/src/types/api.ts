/**
 * Convenience type aliases for commonly used API schemas.
 * These are derived from the auto-generated OpenAPI types.
 *
 * Regenerate the source with: pnpm run codegen:api
 */
import type { components } from './api.generated';

// ─── Products ────────────────────────────────────────────────────────────────
export type ApiProductRead = components['schemas']['ProductReadWithRelationshipsAndFlatComponents'];
export type ApiProductCreate = components['schemas']['ProductCreateWithComponents'];
export type ApiProductUpdate = components['schemas']['ProductUpdate'];
export type ApiProductUpdateWithProperties = components['schemas']['ProductUpdateWithProperties'];

// ─── Media ───────────────────────────────────────────────────────────────────
export type ApiImageRead = components['schemas']['ImageRead'];
export type ApiVideoRead = components['schemas']['VideoReadWithinProduct'];

// ─── Users ───────────────────────────────────────────────────────────────────
export type ApiUserRead = components['schemas']['UserRead'];
export type ApiOAuthAccountRead = components['schemas']['OAuthAccountRead'];

// ─── Newsletter ──────────────────────────────────────────────────────────────
export type ApiNewsletterPreferenceRead = components['schemas']['NewsletterPreferenceRead'];

// ─── Product Types ───────────────────────────────────────────────────────────
export type ApiProductTypeRead = components['schemas']['ProductTypeRead'];

// ─── Pagination ──────────────────────────────────────────────────────────────
export type ApiPaginatedProducts =
  components['schemas']['Page_TypeVar_Customized_ProductReadWithRelationshipsAndFlatComponents_'];
export type ApiPaginatedBrands = components['schemas']['Page_TypeVar_Customized_str_'];
