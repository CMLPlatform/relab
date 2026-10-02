import { useCallback, useEffect, useState } from 'react';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';

type CpvTypeInfo = Pick<CPVCategory, 'id' | 'name' | 'description'>;

export type CpvTypeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; type: Pick<CPVCategory, 'name' | 'description'> }
  | { status: 'error'; retry?: () => void };

/**
 * Resolves a CPV type id to its name and description. A `recorded` snapshot whose id
 * matches is used as-is, so the 2MB dataset only loads for a type picked since load.
 * A failed load is an `error` state with `retry`; an id absent from the dataset is an
 * `error` without one, since retrying cannot help.
 */
export function useCpvType(typeID: number | undefined, recorded?: CpvTypeInfo): CpvTypeState {
  const recordedMatches = typeID !== undefined && recorded?.id === typeID;
  const needsLoad = typeID !== undefined && !recordedMatches;
  const [loaded, setLoaded] = useState<{
    typeID: number;
    type: CPVCategory | null | 'failed';
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on retry
  useEffect(() => {
    if (!needsLoad) return;
    let isMounted = true;
    loadCPV()
      .then((cpv) => {
        // Never fall back to cpv.root: its {name: "undefined"} placeholder is not a real type.
        if (isMounted) setLoaded({ typeID, type: cpv[String(typeID)] ?? null });
      })
      .catch(() => {
        if (isMounted) setLoaded({ typeID, type: 'failed' });
      });
    return () => {
      isMounted = false;
    };
  }, [needsLoad, typeID, attempt]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((n) => n + 1);
  }, []);

  if (typeID === undefined) return { status: 'idle' };
  if (recordedMatches && recorded) {
    return { status: 'ready', type: { name: recorded.name, description: recorded.description } };
  }
  if (loaded && loaded.typeID === typeID) {
    if (loaded.type === 'failed') return { status: 'error', retry };
    return loaded.type ? { status: 'ready', type: loaded.type } : { status: 'error' };
  }
  return { status: 'loading' };
}
