import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

// NOTE: default-closed persisted-cache allowlist: only these first queryKey
// segments survive a reload. The prefixes repeat the feature factories
// (services/ must not import features/); persistedQueryCache.test.ts asserts
// they agree.
const PERSISTED_QUERY_KEY_PREFIXES = new Set<unknown>([
  'products', // product list (infinite)
  'baseProduct', // product detail
  'component', // component (sub-product) detail
  'brands', // reference data
  'productTypes', // reference data
]);

/** `dehydrateOptions.shouldDehydrateQuery` for `_layout.tsx`. Mutations keep the paused-only default. */
export function shouldDehydrateQuery(query: Query) {
  return defaultShouldDehydrateQuery(query) && PERSISTED_QUERY_KEY_PREFIXES.has(query.queryKey[0]);
}
