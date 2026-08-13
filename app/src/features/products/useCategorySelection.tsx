import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';
import { setPendingTypeSelection } from './pendingTypeSelection';

export function useCategorySelection() {
  const router = useRouter();
  // Reached only from an editing detail screen (existing entity or draft), which
  // already requires auth; this is just a safe redirect if the session expired
  // while the picker was open.
  const { user } = useRequireAuth('/products');

  const [cpv, setCpv] = useState<Record<string, CPVCategory> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [cpvClass, setCpvClass] = useState<CPVCategory | null>(null);
  const [history, setHistory] = useState<CPVCategory[]>([]);

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
      // Hand the pick back through the module slot and pop to the detail screen
      // that pushed us — which is still mounted in edit mode, so it just reads
      // the selection on focus. Works for existing entities and unsaved drafts.
      setPendingTypeSelection(typeId);
      router.back();
    },
    [router],
  );

  const filtered = useMemo((): CPVCategory[] => {
    if (!(cpv && cpvClass)) return [];
    if (!debouncedSearchQuery) return cpvClass.directChildren.map((childId) => cpv[childId]);
    const query = debouncedSearchQuery.toLowerCase();
    return cpvClass.allChildren
      .map((childId) => cpv[childId])
      .filter(
        (item) =>
          item.description.toLowerCase().includes(query) || item.name.toLowerCase().includes(query),
      );
  }, [cpv, debouncedSearchQuery, cpvClass]);

  return {
    user,
    cpvClass,
    history,
    filtered,
    searchQuery,
    debouncedSearchQuery,
    setSearchQuery,
    selectBranch,
    moveUp,
    selectType,
  };
}
