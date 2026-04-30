import { useQuery } from '@tanstack/react-query';
import { getBaseProduct, getComponent, isProductNotFoundError } from '@/services/api/products';
import type { Product } from '@/types/Product';

export type AncestorCrumb = {
  id: number;
  name: string;
  role: 'product' | 'component';
};

const MAX_DEPTH = 12;

/**
 * Fetch a node without knowing its role ahead of time. Tries the component
 * endpoint first (the common case during an ancestor walk), falls back to the
 * base-product endpoint on 404. Scoped to this module — role-aware callers
 * should use `getBaseProduct` / `getComponent` directly.
 */
async function fetchNodeByEitherRole(id: number): Promise<Product> {
  try {
    return await getComponent(id);
  } catch (err) {
    if (isProductNotFoundError(err)) return getBaseProduct(id);
    throw err;
  }
}

async function walkAncestors(startParentID: number): Promise<AncestorCrumb[]> {
  const trail: AncestorCrumb[] = [];
  const seen = new Set<number>();
  let cursor: number | undefined = startParentID;

  while (typeof cursor === 'number' && !seen.has(cursor)) {
    if (trail.length >= MAX_DEPTH) break;
    seen.add(cursor);
    // biome-ignore lint/performance/noAwaitInLoops: ancestor chain is inherently sequential — each step depends on the previous node's parent_id.
    const node: Product = await fetchNodeByEitherRole(cursor);
    const parentID = node.parentID;
    const nodeId = typeof node.id === 'number' ? node.id : cursor;
    trail.unshift({
      id: nodeId,
      name: node.name ?? '',
      role: node.role,
    });
    cursor = node.role === 'component' ? parentID : undefined;
  }

  return trail;
}

export function useAncestorTrail(parentID: number | undefined) {
  const enabled = typeof parentID === 'number';
  const query = useQuery({
    queryKey: ['ancestorTrail', parentID ?? null] as const,
    queryFn: () => walkAncestors(parentID as number),
    enabled,
    staleTime: 30_000,
  });

  return {
    ancestors: query.data ?? [],
    isLoading: enabled && query.isLoading,
  };
}
