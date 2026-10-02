import { defaultShouldDehydrateQuery, type InfiniteData, type Query } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

// NOTE: default-closed persisted-cache allowlist: only these first queryKey
// segments survive a reload. The prefixes repeat the feature factories
// (services/ must not import features/); persistedQueryCache.test.ts asserts
// they agree.
const PERSISTED_QUERY_KEY_PREFIXES = new Set<unknown>([
  'products', // product lists (infinite; first page only, see serializePersistedClient)
  'baseProduct', // product detail
  'component', // component (sub-product) detail
  'brands', // reference data
  'productTypes', // reference data
]);

/** `dehydrateOptions.shouldDehydrateQuery` for `_layout.tsx`. Mutations keep the paused-only default. */
export function shouldDehydrateQuery(query: Query) {
  return defaultShouldDehydrateQuery(query) && PERSISTED_QUERY_KEY_PREFIXES.has(query.queryKey[0]);
}

function isInfiniteData(data: unknown): data is InfiniteData<unknown> {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as InfiniteData<unknown>).pages) &&
    Array.isArray((data as InfiniteData<unknown>).pageParams)
  );
}

/**
 * The persister's `serialize`: an infinite list keeps its first page only. A
 * restored infinite query refetches every page it holds, one request each, so a
 * list scrolled ten pages deep would cost ten requests on the next cold start.
 */
export function serializePersistedClient(client: PersistedClient): string {
  const queries = client.clientState.queries.map((query) => {
    const { data } = query.state;
    if (!isInfiniteData(data) || data.pages.length <= 1) return query;
    return {
      ...query,
      state: {
        ...query.state,
        data: { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
      },
    };
  });
  return JSON.stringify({ ...client, clientState: { ...client.clientState, queries } });
}
