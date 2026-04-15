import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useDebounce } from 'use-debounce';
import { useDialog } from '@/components/common/DialogProvider';
import { useAuth } from '@/context/AuthProvider';
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORT_OPTIONS,
  useProductsQuery,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
} from '@/hooks/useProductQueries';
import { updateUser } from '@/services/api/authentication';
import { setNewProductIntent } from '@/services/newProductStore';
import { getLocalItem, setLocalItem } from '@/services/storage';
import type { Product } from '@/types/Product';
import { logError } from '@/utils/logging';

export type ProductFilter = 'all' | 'mine';
type RouterSetParams = Parameters<ReturnType<typeof useRouter>['setParams']>[0];
type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };

const GUEST_INFO_CARD_STORAGE_KEY = 'products_info_card_dismissed_guest';
const FALLBACK_DEFAULT_SORT = Array.from(PRODUCT_SORT_OPTIONS[1].value);

export function useProductsScreen(numColumns: number) {
  const dialog = useDialog();
  const router = useRouter();
  const { user: currentUser, refetch: refetchUser } = useAuth();
  const params = useLocalSearchParams<{
    filterMode?: string;
    q?: string;
    page?: string;
    sort?: string;
    brands?: string;
    types?: string;
    days?: string;
  }>();

  const filterMode = (params.filterMode as ProductFilter) || 'all';
  const searchQueryURL = params.q || '';
  const page = Number(params.page) || 1;
  const sortBy = params.sort
    ? params.sort.split(',')
    : searchQueryURL
      ? (['rank'] as string[])
      : Array.from(DEFAULT_PRODUCT_SORT ?? FALLBACK_DEFAULT_SORT);
  const activeDatePreset = params.days ? Number(params.days) : null;
  const activeBrands = params.brands ? params.brands.split(',') : [];
  const activeProductTypes = params.types ? params.types.split(',') : [];
  const createdAfter = useMemo(() => {
    if (!activeDatePreset) return undefined;
    return new Date(Date.now() - activeDatePreset * 86_400_000);
  }, [activeDatePreset]);

  const [searchQuery, setSearchQuery] = useState(searchQueryURL);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const [mobilePage, setMobilePage] = useState(1);
  const effectivePage = numColumns === 1 ? mobilePage : page;
  const [headerBottom, setHeaderBottom] = useState(0);
  const [fabExtended, setFabExtended] = useState(true);
  const [showInfoCard, setShowInfoCard] = useState<boolean | null>(null);
  const [accumulatedProducts, setAccumulatedProducts] = useState<Product[]>([]);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [slowLoading, setSlowLoading] = useState(false);
  const isAuthenticated = !!currentUser;

  const updateParams = useCallback(
    (newParams: RouterSetParams) => {
      router.setParams(newParams);
    },
    [router],
  );

  useEffect(() => {
    if (debouncedSearchQuery !== searchQueryURL) {
      updateParams({ q: debouncedSearchQuery || undefined, page: '1' });
    }
  }, [debouncedSearchQuery, searchQueryURL, updateParams]);

  useEffect(() => {
    if (!searchQueryURL && params.sort === 'rank') {
      updateParams({ sort: undefined });
    }
  }, [searchQueryURL, params.sort, updateParams]);

  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(brandSearch);
  const { data: typeResults, isLoading: typesLoading } = useSearchProductTypesQuery(typeSearch);

  useEffect(() => {
    if (!currentUser && filterMode === 'mine') {
      updateParams({ filterMode: 'all', page: '1' });
    }
  }, [currentUser, filterMode, updateParams]);

  const { data, isFetching, isLoading, error, refetch } = useProductsQuery(
    filterMode,
    effectivePage,
    searchQueryURL,
    sortBy,
    { brands: activeBrands, createdAfter, productTypeNames: activeProductTypes },
  );
  const resetAccumulationKey = JSON.stringify([
    searchQueryURL,
    filterMode,
    activeDatePreset,
    params.brands,
    params.types,
    params.sort,
  ]);

  useEffect(() => {
    if (!isLoading) {
      setSlowLoading(false);
      return;
    }
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      (timer as TimerWithUnref).unref();
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    void resetAccumulationKey;
    setMobilePage(1);
    setAccumulatedProducts([]);
  }, [resetAccumulationKey]);

  useEffect(() => {
    if (!data?.items) return;
    if (data.page !== effectivePage) return;
    if (effectivePage === 1) {
      setAccumulatedProducts(data.items);
      return;
    }
    setAccumulatedProducts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      return [...prev, ...data.items.filter((p) => !existingIds.has(p.id))];
    });
  }, [data, effectivePage]);

  useEffect(() => {
    if (isAuthenticated) {
      setShowInfoCard(currentUser?.preferences?.products_welcome_dismissed !== true);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const dismissed = await getLocalItem(GUEST_INFO_CARD_STORAGE_KEY);
        if (!cancelled) setShowInfoCard(dismissed !== 'true');
      } catch {
        if (!cancelled) setShowInfoCard(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUser?.preferences?.products_welcome_dismissed]);

  const dismissInfoCard = async () => {
    setShowInfoCard(false);
    if (isAuthenticated) {
      try {
        await updateUser({ preferences: { products_welcome_dismissed: true } });
        if (typeof refetchUser === 'function') {
          await refetchUser(false);
        }
      } catch (err) {
        logError('Failed to save info card preference:', err);
      }
      return;
    }

    try {
      await setLocalItem(GUEST_INFO_CARD_STORAGE_KEY, 'true');
    } catch (err) {
      logError('Failed to save info card preference:', err);
    }
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

  const newProduct = () => {
    if (!currentUser) {
      dialog.alert({
        title: 'Sign In Required',
        message: 'Sign in to add new products and manage your own submissions.',
        buttons: [
          { text: 'Cancel' },
          { text: 'Sign in', onPress: () => router.push('/login?redirectTo=/products') },
        ],
      });
      return;
    }

    if (!currentUser.isVerified) {
      dialog.alert({
        title: 'Email Verification Required',
        message:
          'Please verify your email address before creating products. Check your inbox for the verification link or go to your Profile to resend it.',
        buttons: [
          { text: 'OK' },
          { text: 'Go to Profile', onPress: () => router.push('/profile') },
        ],
      });
      return;
    }

    dialog.input({
      title: 'Create New Product',
      placeholder: 'Product Name',
      helperText: 'Enter a descriptive name between 2 and 100 characters',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'OK',
          disabled: (value) => {
            const name = typeof value === 'string' ? value.trim() : '';
            return name.length < 2 || name.length > 100;
          },
          onPress: (productName) => {
            const name = typeof productName === 'string' ? productName.trim() : '';
            setNewProductIntent({ name });
            router.push({ pathname: '/products/[id]', params: { id: 'new' } });
          },
        },
      ],
    });
  };

  const productList = numColumns === 1 ? accumulatedProducts : (data?.items ?? []);
  const totalPages = data?.pages ?? 0;
  const total = data?.total ?? 0;
  const hasMore = (data?.page ?? 0) < (data?.pages ?? 0);

  return {
    params,
    filterMode,
    searchQueryURL,
    sortBy,
    activeDatePreset,
    activeBrands,
    activeProductTypes,
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
    effectivePage,
    setMobilePage,
    headerBottom,
    setHeaderBottom,
    fabExtended,
    showInfoCard,
    sortMenuVisible,
    setSortMenuVisible,
    dateMenuVisible,
    setDateMenuVisible,
    brandModalVisible,
    setBrandModalVisible,
    typeModalVisible,
    setTypeModalVisible,
    brandSearch,
    setBrandSearch,
    typeSearch,
    setTypeSearch,
    slowLoading,
    brandResults,
    brandsLoading,
    typeResults,
    typesLoading,
    isAuthenticated,
    data,
    isFetching,
    isLoading,
    error,
    refetch,
    productList,
    totalPages,
    total,
    hasMore,
    currentUser,
    updateParams,
    dismissInfoCard,
    onScroll,
    newProduct,
  };
}
