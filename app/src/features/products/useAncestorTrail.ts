import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { isProductNotFoundError } from '@/services/api/products';
import type { Product } from '@/types/Product';
import { baseProductQueryOptions, componentQueryOptions } from './queries';

export type AncestorCrumb = {
  id: number;
  name: string;
  role: 'product' | 'component';
};

const MAX_DEPTH = 12;

/**
 * Fetch a node without knowing its role ahead of time. Tries the component
 * endpoint first (the common case during an ancestor walk), falls back to the
 * base-product endpoint on 404. Reads through the query cache so ancestors the
 * user just navigated resolve without a network round-trip.
 */
async function fetchNodeByEitherRole(queryClient: QueryClient, id: number): Promise<Product> {
  try {
    return await queryClient.ensureQueryData(componentQueryOptions(id));
  } catch (err) {
    if (isProductNotFoundError(err)) {
      return queryClient.ensureQueryData(baseProductQueryOptions(id));
    }
    throw err;
  }
}

async function walkAncestors(
  queryClient: QueryClient,
  startParentID: number,
): Promise<AncestorCrumb[]> {
  const trail: AncestorCrumb[] = [];
  const seen = new Set<number>();
  let cursor: number | undefined = startParentID;

  while (typeof cursor === 'number' && !seen.has(cursor)) {
    if (trail.length >= MAX_DEPTH) break;
    seen.add(cursor);
    // biome-ignore lint/performance/noAwaitInLoops: ancestor chain is inherently sequential — each step depends on the previous node's parent_id.
    const node: Product = await fetchNodeByEitherRole(queryClient, cursor);
    const parentID = node.parentID;
    const nodeId = typeof node.id === 'number' ? node.id : cursor;
    trail.unshift({
      id: nodeId,
      name: node.name,
      role: node.role,
    });
    cursor = node.role === 'component' ? parentID : undefined;
  }

  return trail;
}

export function useAncestorTrail(parentID: number | undefined) {
  const enabled = typeof parentID === 'number';
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['ancestorTrail', parentID ?? null] as const,
    queryFn: () => walkAncestors(queryClient, parentID as number),
    enabled,
    staleTime: 30_000,
  });

  return {
    ancestors: query.data ?? [],
    isLoading: enabled && query.isLoading,
  };
}
