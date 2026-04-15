/**
 * Convenience type aliases for commonly used API schemas.
 * These are derived from the auto-generated OpenAPI types.
 *
 * Regenerate the source with: pnpm run codegen:api
 */
import type { components } from './api.generated';

type ApiSchemaName = keyof components['schemas'];

// ─── Products ────────────────────────────────────────────────────────────────
export type ApiProductRead = components['schemas']['ProductReadWithRelationshipsAndFlatComponents'];
export type ApiProductCreate = components['schemas']['ProductCreateWithComponents'];
export type ApiProductUpdate = components['schemas']['ProductUpdate'];
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
type ProductPageSchemaName = Extract<
  ApiSchemaName,
  | 'Page_TypeVar_Customized_ProductRead_'
  | 'Page_TypeVar_Customized_ProductReadWithRelationshipsAndFlatComponents_'
>;
type StringPageSchemaName = Extract<ApiSchemaName, 'Page_TypeVar_Customized_str_'>;

export type ApiPaginatedProducts = components['schemas'][ProductPageSchemaName];
export type ApiPaginatedBrands = components['schemas'][StringPageSchemaName];

// ─── RPi Cam ────────────────────────────────────────────────────────────────
export type ApiCameraConnectionStatus = components['schemas']['CameraConnectionStatus'];
export type ApiCameraCredentialStatus = components['schemas']['CameraCredentialStatus'];
export type ApiCameraStatus = components['schemas']['CameraStatus'];
export type ApiCameraRead = components['schemas']['CameraRead'];
export type ApiCameraTelemetry = components['schemas']['TelemetrySnapshot'];
export type ApiCameraReadWithStatus = components['schemas']['CameraReadWithStatus'];
export type ApiPairingClaimRequest = components['schemas']['PairingClaimRequest'];
export type ApiLocalAccessInfo = components['schemas']['LocalAccessInfo'];
export type ApiStreamView = components['schemas']['StreamView'];
export type ApiThermalState = components['schemas']['ThermalState'];
