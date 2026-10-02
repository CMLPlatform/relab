import { useQuery } from '@tanstack/react-query';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';
import type { Product } from '@/types/Product';

export type CpvTypeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; type: Pick<CPVCategory, 'name' | 'description'> }
  | { status: 'error'; retry?: () => void };

/**
 * Resolves a CPV type id to its name and description. A `recorded` type whose id
 * matches is shown as the API returned it: the snapshot is keyed by its own ids, which
 * match the database's only by construction order. So the 2MB dataset only loads for a
 * type picked since load. A failed load is an `error` state with `retry`; an id absent
 * from the dataset is an `error` without one, since retrying cannot help.
 */
export function useCpvType(
  typeID: number | undefined,
  recorded?: Product['productType'],
): CpvTypeState {
  const recordedMatches = typeID !== undefined && recorded?.id === typeID;
  // NOTE: 'cpv' stays out of the persisted-cache allowlist: the dataset is 2MB.
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ['cpv'] as const,
    queryFn: loadCPV,
    staleTime: Infinity,
    retry: false,
    enabled: typeID !== undefined && !recordedMatches,
  });

  if (typeID === undefined) return { status: 'idle' };
  if (recordedMatches && recorded) {
    return {
      status: 'ready',
      type: { name: recorded.name, description: recorded.description ?? '' },
    };
  }
  if (data) {
    // Never fall back to cpv.root: its {name: "undefined"} placeholder is not a real type.
    const type = data[String(typeID)];
    return type ? { status: 'ready', type } : { status: 'error' };
  }
  if (isError && !isFetching) return { status: 'error', retry: refetch };
  return { status: 'loading' };
}
