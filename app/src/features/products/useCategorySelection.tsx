import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const [cpv, setCpv] = useState<Record<string, CPVCategory> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [cpvClass, setCpvClass] = useState<CPVCategory | null>(null);
  const [history, setHistory] = useState<CPVCategory[]>([]);
  const { recents, recordRecent } = useRecentCategories();
  // Public aggregate; a failure just hides the shortcut section.
  const { data: topCategories } = useQuery(topCategoriesQueryOptions);

  useEffect(() => {
    let isMounted = true;
    loadCPV()
      .then((data) => {
        if (!isMounted) return;
        setCpv(data);
        setCpvClass(data.root);
        setHistory([data.root]);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const selectBranch = (item: CPVCategory) => {
    setHistory((h) => [...h, item]);
    setCpvClass(item);
  };

  const moveUp = () => {
    setHistory((h) => {
      const next = h.slice(0, -1);
      setCpvClass(next[next.length - 1]);
      return next;
    });
  };

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
