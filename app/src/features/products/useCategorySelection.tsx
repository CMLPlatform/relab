import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { topCategoriesQueryOptions } from '@/features/products/queries';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';
import { setPendingTypeSelection } from './pendingTypeSelection';
import { useRecentCategories } from './useRecentCategories';

export function useCategorySelection() {
  const router = useRouter();
  // Safe redirect if the session expired while the picker was open.
  const { user } = useRequireAuth('/products');

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  // The bundled taxonomy, loaded lazily; a failed load shows a retry instead of a spinner.
  const {
    data: cpv,
    isError: loadFailed,
    refetch: retryLoad,
  } = useQuery({ queryKey: ['cpv'], queryFn: loadCPV, staleTime: Number.POSITIVE_INFINITY });
  // Branches browsed into below the root.
  const [trail, setTrail] = useState<CPVCategory[]>([]);
  const cpvClass = trail.at(-1) ?? cpv?.root ?? null;
  const history = cpv ? [cpv.root, ...trail] : [];
  const { recents, recordRecent } = useRecentCategories();
  // Public aggregate; a failure just hides the shortcut section.
  const { data: topCategories } = useQuery(topCategoriesQueryOptions);

  const selectBranch = (item: CPVCategory) => setTrail((t) => [...t, item]);
  const moveUp = () => setTrail((t) => t.slice(0, -1));

  const selectType = useCallback(
    (typeId: number) => {
      const category = cpv?.[String(typeId)];
      if (category) recordRecent(category);
      // Hand the pick back through the module slot; the detail screen reads it on focus.
      setPendingTypeSelection(typeId);
      router.back();
    },
    [cpv, recordRecent, router],
  );

  const filtered = useMemo((): CPVCategory[] => {
    if (!(cpv && cpvClass)) return [];
    if (!debouncedSearchQuery) return cpvClass.directChildren.map((childId) => cpv[childId]);
    return filterCategories(cpv, debouncedSearchQuery);
  }, [cpv, debouncedSearchQuery, cpvClass]);

  // Stats report a type by stored name (the CPV code); resolve it to the bundled node.
  const commonTypes = useMemo((): CPVCategory[] => {
    if (!(cpv && topCategories?.length)) return [];
    const byName = new Map(Object.values(cpv).map((item) => [item.name, item]));
    return topCategories.flatMap(({ name }) => byName.get(name) ?? []);
  }, [cpv, topCategories]);

  return {
    user,
    cpvClass,
    loadFailed,
    retryLoad,
    history,
    filtered,
    commonTypes,
    recents,
    searchQuery,
    debouncedSearchQuery,
    setSearchQuery,
    selectBranch,
    moveUp,
    selectType,
  };
}

/** Name/description match across the whole taxonomy, whatever level is being browsed. */
export function filterCategories(cpv: Record<string, CPVCategory>, query: string): CPVCategory[] {
  const needle = query.toLowerCase();
  return Object.values(cpv).filter(
    (item) =>
      item !== cpv.root &&
      (item.description.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle)),
  );
}
