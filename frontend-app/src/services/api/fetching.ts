/**
 * Barrel re-export for backward compatibility.
 * New code should import from the specific modules directly:
 *   - @/services/api/client     (apiFetch)
 *   - @/services/api/products   (getProduct, newProduct, allProducts, myProducts, etc.)
 *   - @/services/api/brands     (searchBrands, allBrands)
 *   - @/services/api/productTypes (searchProductTypes, allProductTypes)
 */

export { allBrands, searchBrands } from './brands';
export { apiFetch } from './client';
export type { PaginatedResponse, ProductData } from './products';
export {
  allProducts,
  FULL_PRODUCT_INCLUDES,
  getProduct,
  myProducts,
  newProduct,
  productComponents,
} from './products';
export { allProductTypes, searchProductTypes } from './productTypes';
