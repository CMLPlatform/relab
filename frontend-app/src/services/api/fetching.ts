/**
 * Barrel re-export for backward compatibility.
 * New code should import from the specific modules directly:
 *   - @/services/api/client     (apiFetch)
 *   - @/services/api/products   (getProduct, newProduct, allProducts, myProducts, etc.)
 *   - @/services/api/brands     (searchBrands, allBrands)
 *   - @/services/api/productTypes (searchProductTypes, allProductTypes)
 */
export { apiFetch } from './client';
export { getProduct, newProduct, allProducts, myProducts, productComponents, FULL_PRODUCT_INCLUDES } from './products';
export type { PaginatedResponse, ProductData } from './products';
export { searchBrands, allBrands } from './brands';
export { searchProductTypes, allProductTypes } from './productTypes';
