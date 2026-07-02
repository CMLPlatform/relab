import {
  type NativeStackHeaderBackProps,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { useAuth } from '@/context/auth';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';

export function useCategorySelection() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [cpv, setCpv] = useState<Record<string, CPVCategory> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cpvClass, setCpvClass] = useState<CPVCategory | null>(null);
  const [history, setHistory] = useState<CPVCategory[]>([]);

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: `/products/${id}` } });
    }
  }, [user, id, router]);

  const goToProduct = useCallback(
    () => router.replace({ pathname: '/products/[id]', params: { id } }),
    [router, id],
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props: NativeStackHeaderBackProps) => (
        <HeaderBackButton {...props} onPress={goToProduct} />
      ),
    });
  }, [navigation, goToProduct]);

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

  const selectType = (typeId: number) => {
    router.dismissTo({ pathname: '/products/[id]', params: { id, typeSelection: typeId } });
  };

  const filtered = useMemo((): CPVCategory[] => {
    if (!(cpv && cpvClass)) return [];
    if (!searchQuery) return cpvClass.directChildren.map((childId) => cpv[childId]);
    const query = searchQuery.toLowerCase();
    return cpvClass.allChildren
      .map((childId) => cpv[childId])
      .filter(
        (item) =>
          item.description.toLowerCase().includes(query) || item.name.toLowerCase().includes(query),
      );
  }, [cpv, searchQuery, cpvClass]);

  return {
    user,
    cpvClass,
    history,
    filtered,
    searchQuery,
    setSearchQuery,
    selectBranch,
    moveUp,
    selectType,
  };
}
