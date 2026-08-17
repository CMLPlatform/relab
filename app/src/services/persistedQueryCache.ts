import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

// NOTE: default-closed persisted-cache allowlist. Only queries whose first
// queryKey segment is listed here survive a reload; anything else — camera/
// telemetry state, profiles, stats, auth-adjacent queries, and any query key
// added later — stays memory-only until someone deliberately adds it here.
// The prefixes repeat what the feature queryKey factories own — importing
// them here would point services/ at features/ and invert the dependency
// direction — so persistedQueryCache.test.ts asserts the two sources still
// agree by running the real factories through this function. CPV categories are
// reference data too, but they ship as a bundled asset read through a
// module-level promise (@/services/cpv), never through the query client —
// there is no CPV queryKey to allowlist.
const PERSISTED_QUERY_KEY_PREFIXES = new Set<unknown>([
  'products', // product list (infinite)
  'baseProduct', // product detail
  'component', // component (sub-product) detail
  'brands', // reference data
  'productTypes', // reference data
]);

/**
 * `dehydrateOptions.shouldDehydrateQuery` for `_layout.tsx`'s
 * `PersistQueryClientProvider`. Only `shouldDehydrateQuery` is overridden —
 * `shouldDehydrateMutation` is left at its default (paused-only), so a paused
 * offline capture mutation still dehydrates regardless of this allowlist.
 */
export function shouldDehydrateQuery(query: Query) {
  return defaultShouldDehydrateQuery(query) && PERSISTED_QUERY_KEY_PREFIXES.has(query.queryKey[0]);
}
