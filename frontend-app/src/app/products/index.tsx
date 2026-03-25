// Products list moved here from app/index.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  useColorScheme,
} from 'react-native';
import { useDebounce } from 'use-debounce';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  AnimatedFAB,
  Button,
  Card,
  Chip,
  IconButton,
  Menu,
  Searchbar,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import { useDialog } from '@/components/common/DialogProvider';
import FilterSelectionModal from '@/components/common/FilterSelectionModal';
import ProductCard from '@/components/common/ProductCard';
import ProductCardSkeleton from '@/components/common/ProductCardSkeleton';
import { useAuth } from '@/context/AuthProvider';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import {
  PRODUCT_SORT_OPTIONS,
  useProductsQuery,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
} from '@/hooks/useProductQueries';
import { setNewProductIntent } from '@/services/newProductStore';
import { Product } from '@/types/Product';

type ProductFilter = 'all' | 'mine';

const GUEST_INFO_CARD_STORAGE_KEY = 'products_info_card_dismissed_guest';
const AUTH_INFO_CARD_STORAGE_KEY = 'products_info_card_dismissed_authenticated';
const PAGE_SIZE = 20;

const DATE_PRESETS = [
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 90d', days: 90 },
] as const;

// Using constants from useProductQueries.ts
const SORT_OPTIONS = PRODUCT_SORT_OPTIONS;

// ─── Sub-components ────────────────────────────────────────────────────────────

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  total: number;
  isFetching: boolean;
  setPage: (page: number) => void;
};

function PaginationControls({ page, totalPages, total, isFetching, setPage }: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | 'ellipsis')[] = [1];
    if (page > 3) pages.push('ellipsis');
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
      pages.push(p);
    }
    if (page < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  };

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <View style={{ padding: 16, alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 14, opacity: 0.7 }}>
        Page {page} of {totalPages} — Showing {start.toLocaleString()}–{end.toLocaleString()} of{' '}
        {total.toLocaleString()} products
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button
          mode="outlined"
          compact
          onPress={() => setPage(page - 1)}
          disabled={page <= 1 || isFetching}
          accessibilityLabel="Previous page"
        >
          Previous
        </Button>
        {getPageNumbers().map((p, i) =>
          p === 'ellipsis' ? (
            <Text key={`ellipsis-${i}`} style={{ paddingHorizontal: 4 }}>
              …
            </Text>
          ) : (
            <Button
              key={p}
              mode={p === page ? 'contained' : 'outlined'}
              compact
              onPress={() => setPage(p as number)}
              disabled={isFetching}
              accessibilityLabel={`Page ${p}`}
            >
              {String(p)}
            </Button>
          ),
        )}
        <Button
          mode="outlined"
          compact
          onPress={() => setPage(page + 1)}
          disabled={page >= totalPages || isFetching}
          accessibilityLabel="Next page"
        >
          Next
        </Button>
      </View>
    </View>
  );
}

function NewProductPill() {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.inlineButtonPill,
        {
          backgroundColor: theme.colors.primaryContainer,
        },
      ]}
    >
      <Text style={[styles.inlineButtonText, { color: theme.colors.onPrimaryContainer }]}>New Product</Text>
    </View>
  );
}

function ProfilePill() {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.inlineProfilePill,
        {
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
        },
      ]}
    >
      <MaterialCommunityIcons name="account-circle" size={14} color={theme.colors.onBackground} />
      <Text style={[styles.inlineProfileText, { color: theme.colors.onBackground }]}>profile</Text>
    </View>
  );
}

type ListFooterProps = {
  isDesktopWeb: boolean;
  hasMore: boolean;
  productCount: number;
  total: number;
  isFetching: boolean;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
};

function ListFooter({
  isDesktopWeb,
  hasMore,
  productCount,
  total,
  isFetching,
  page,
  totalPages,
  setPage,
}: ListFooterProps) {
  if (isDesktopWeb) {
    return (
      <PaginationControls page={page} totalPages={totalPages} total={total} isFetching={isFetching} setPage={setPage} />
    );
  }

  // Mobile web and native: unified load-more pattern with counter
  if (!hasMore && productCount > 0) {
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <Text style={{ opacity: 0.6 }}>
          Showing {productCount.toLocaleString()} of {total.toLocaleString()} — End of results
        </Text>
      </View>
    );
  }
  if (!hasMore) return null;
  return (
    <View style={{ paddingVertical: 16, alignItems: 'center' }}>
      <Text style={{ opacity: 0.7, marginBottom: 8 }}>
        Showing {productCount.toLocaleString()} of {total.toLocaleString()}
      </Text>
      {isFetching ? (
        <ActivityIndicator size="small" />
      ) : (
        <Button
          mode="outlined"
          onPress={() => setPage(page + 1)}
          disabled={isFetching}
          accessibilityLabel="Load more products"
        >
          Load more
        </Button>
      )}
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function Products() {
  // Hooks
  const dialog = useDialog();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const bgOverlay = colorScheme === 'light' ? 'rgba(242, 242, 242, 0.95)' : 'rgba(10,10,10,0.90)';
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const isDesktopWeb = useIsDesktop();

  // --- State Derived from URL/Search Params ---
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
  const sortBy = params.sort ? params.sort.split(',') : (SORT_OPTIONS[0].value as unknown as string[]);
  const activeDatePreset = params.days ? Number(params.days) : null;
  const activeBrands = params.brands ? params.brands.split(',') : [];
  const activeProductTypes = params.types ? params.types.split(',') : [];

  const createdAfter = useMemo(() => {
    if (!activeDatePreset) return undefined;
    // We use a stable reference for "now" at the start of the day or just now
    // to avoid millisecond changes triggering re-fetches.
    // However, since it's in useMemo synced to activeDatePreset,
    // it will ONLY re-calculate when the preset changes.
    return new Date(Date.now() - activeDatePreset * 86_400_000);
  }, [activeDatePreset]);

  // Local state for UI responsiveness (search input)
  const [searchQuery, setSearchQuery] = useState(searchQueryURL);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);

  // Sync local search back to URL
  // Local UI states
  const [headerBottom, setHeaderBottom] = useState(0);
  const [fabExtended, setFabExtended] = useState(true);
  const [showInfoCard, setShowInfoCard] = useState<boolean | null>(null);
  const [accumulatedProducts, setAccumulatedProducts] = useState<Product[]>([]);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [slowLoading, setSlowLoading] = useState(false);

  // Helper to update URL params
  const updateParams = useCallback(
    (newParams: Record<string, string | string[] | undefined>) => {
      // Expo Router's setParams merges with existing ones for the current route.
      // We don't need to manually merge with `params`.
      router.setParams(newParams as any);
    },
    [router],
  );

  // Sync local search back to URL
  useEffect(() => {
    if (debouncedSearchQuery !== searchQueryURL) {
      updateParams({ q: debouncedSearchQuery || undefined, page: '1' });
    }
  }, [debouncedSearchQuery, searchQueryURL, updateParams]); // Added searchQueryURL to dependencies for robustness

  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(brandSearch);
  const { data: typeResults, isLoading: typesLoading } = useSearchProductTypesQuery(typeSearch);

  const isAuthenticated = !!currentUser;

  // If user logs out while on "mine", switch back to all
  useEffect(() => {
    if (!currentUser && filterMode === 'mine') {
      updateParams({ filterMode: 'all', page: '1' });
    }
  }, [currentUser, filterMode, updateParams]);

  // TanStack Query
  const { data, isFetching, isLoading, error, refetch } = useProductsQuery(
    filterMode,
    page,
    searchQueryURL, // Use the one from the URL
    sortBy,
    { brands: activeBrands, createdAfter, productTypeNames: activeProductTypes },
  );

  // ─── Timeout for slow loading ────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading) {
      setSlowLoading(false);
      return;
    }
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      (timer as any).unref();
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!data?.items) return;
    if (data.page !== page) return;
    if (page === 1) {
      setAccumulatedProducts(data.items);
    } else {
      setAccumulatedProducts((prev) => [...prev, ...data.items]);
    }
  }, [data, page]);

  const productList: Product[] = isDesktopWeb ? (data?.items ?? []) : accumulatedProducts;
  const totalPages = data?.pages ?? 0;
  const total = data?.total ?? 0;
  const hasMore = (data?.page ?? 0) < (data?.pages ?? 0);
  const infoCardStorageKey = isAuthenticated ? AUTH_INFO_CARD_STORAGE_KEY : GUEST_INFO_CARD_STORAGE_KEY;

  // Load info card preference once
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (Platform.OS === 'web') {
          const dismissed = typeof window !== 'undefined' ? window.localStorage.getItem(infoCardStorageKey) : null;
          if (!cancelled) setShowInfoCard(dismissed !== 'true');
        } else {
          const dismissed = await AsyncStorage.getItem(infoCardStorageKey);
          if (!cancelled) setShowInfoCard(dismissed !== 'true');
        }
      } catch {
        if (!cancelled) setShowInfoCard(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [infoCardStorageKey]);

  const dismissInfoCard = async () => {
    setShowInfoCard(false);
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.localStorage.setItem(infoCardStorageKey, 'true');
      } else {
        await AsyncStorage.setItem(infoCardStorageKey, 'true');
      }
    } catch (err) {
      console.error('Failed to save info card preference:', err);
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
        buttons: [{ text: 'Cancel' }, { text: 'Sign in', onPress: () => router.push('/login?redirectTo=/products') }],
      });
      return;
    }

    if (!currentUser?.isVerified) {
      dialog.alert({
        title: 'Email Verification Required',
        message:
          'Please verify your email address before creating products. Check your inbox for the verification link or go to your Profile to resend it.',
        buttons: [{ text: 'OK' }, { text: 'Go to Profile', onPress: () => router.push('/profile') }],
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

  const segmentButtons = isAuthenticated
    ? [
        { value: 'all', label: 'All Products', icon: 'database' },
        { value: 'mine', label: 'My Products', icon: 'account' },
      ]
    : [{ value: 'all', label: 'All Products', icon: 'database' }];

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <View
        style={{ padding: 10, gap: 10 }}
        onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        {/* Welcome banner shown on first visit */}
        {showInfoCard === true && (
          <Card mode="contained" style={[styles.welcomeCard, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Card.Content style={styles.welcomeCardContent}>
              <View style={styles.welcomeHeaderRow}>
                <View style={[styles.welcomeIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                  <MaterialCommunityIcons
                    name="rocket-launch-outline"
                    size={22}
                    color={theme.colors.onPrimaryContainer}
                  />
                </View>
                <View style={styles.welcomeTextBlock}>
                  <Text style={styles.welcomeTitle}>
                    {!isAuthenticated
                      ? 'Welcome to RELab'
                      : currentUser?.isVerified
                        ? 'Ready to add products'
                        : 'Verify your email to start creating'}
                  </Text>
                </View>
              </View>

              <View style={styles.welcomeBody}>
                {!isAuthenticated ? (
                  <Text style={styles.welcomeBodyText}>
                    Browse products freely. Sign in when you are ready to add your own.
                  </Text>
                ) : currentUser?.isVerified ? (
                  <View style={styles.welcomeSentence}>
                    <Text style={styles.welcomeBodyText}>Use the </Text>
                    <NewProductPill />
                    <Text style={styles.welcomeBodyText}> button to add products, and manage your </Text>
                    <ProfilePill />
                    <Text style={styles.welcomeBodyText}> anytime.</Text>
                  </View>
                ) : (
                  <View style={styles.welcomeSentence}>
                    <Text style={styles.welcomeBodyText}>You can browse products and manage your</Text>
                    <ProfilePill />
                    <Text style={styles.welcomeBodyText}>. Once your email is verified, you can use the </Text>
                    <NewProductPill />
                    <Text style={styles.welcomeBodyText}> button to create products.</Text>
                  </View>
                )}
              </View>

              <View style={styles.welcomeActions}>
                {!isAuthenticated ? (
                  <Button
                    mode="contained-tonal"
                    onPress={() => {
                      dismissInfoCard();
                      router.push('/login');
                    }}
                  >
                    Sign in
                  </Button>
                ) : !currentUser?.isVerified ? (
                  <Button
                    mode="contained-tonal"
                    icon="email-check-outline"
                    onPress={() => {
                      dismissInfoCard();
                      router.push('/profile');
                    }}
                  >
                    Verify email
                  </Button>
                ) : null}
                <Button mode="text" onPress={dismissInfoCard}>
                  {isAuthenticated ? 'Got it' : 'Maybe later'}
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Filter Buttons */}
        {segmentButtons.length > 1 && (
          <SegmentedButtons
            value={filterMode}
            onValueChange={(value) => {
              if (value === 'mine' && !isAuthenticated) {
                dialog.alert({
                  title: 'Sign in required',
                  message: 'Sign in to view and manage your products.',
                  buttons: [{ text: 'Cancel' }, { text: 'Sign in', onPress: () => router.push('/login') }],
                });
                return;
              }
              updateParams({
                filterMode: value as string,
                page: '1',
                // Explicitly clear others if they should be cleared on mode switch?
                // Usually we keep filters but maybe not for "mine" vs "all"
              });
            }}
            buttons={segmentButtons}
          />
        )}

        {/* Search Bar + Sort */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Searchbar
            placeholder="Search products"
            onChangeText={(text) => {
              setSearchQuery(text);
              if (!text) {
                // Instant clear when the user clicks the "x" (which passes empty string)
                updateParams({ q: undefined, page: '1' });
              }
            }}
            value={searchQuery}
            icon="magnify"
            clearIcon="close"
            loading={isFetching && !!debouncedSearchQuery}
            style={{ flex: 1 }}
          />
          <Menu
            visible={sortMenuVisible}
            onDismiss={() => setSortMenuVisible(false)}
            anchor={
              <IconButton
                icon="sort"
                mode="contained-tonal"
                onPress={() => setSortMenuVisible(true)}
                accessibilityLabel="Sort products"
              />
            }
          >
            {SORT_OPTIONS.map((opt) => (
              <Menu.Item
                key={opt.label}
                title={opt.label}
                trailingIcon={sortBy[0] === opt.value[0] ? 'check' : undefined}
                onPress={() => {
                  updateParams({ sort: opt.value.join(','), page: '1' });
                  setSortMenuVisible(false);
                }}
              />
            ))}
          </Menu>
        </View>

        {/* Filter Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {/* Date presets */}
          {DATE_PRESETS.map((preset) => (
            <Chip
              key={preset.days}
              icon="calendar"
              selected={activeDatePreset === preset.days}
              mode={activeDatePreset === preset.days ? 'flat' : 'outlined'}
              onPress={() => {
                const toggling = activeDatePreset === preset.days;
                updateParams({
                  days: toggling ? undefined : String(preset.days),
                  page: '1',
                });
              }}
              compact
            >
              {preset.label}
            </Chip>
          ))}

          {/* Brand filter */}
          <Chip
            icon="tag"
            selected={activeBrands.length > 0}
            mode={activeBrands.length > 0 ? 'flat' : 'outlined'}
            onPress={() => setBrandModalVisible(true)}
            onClose={
              activeBrands.length > 0
                ? () => {
                    updateParams({ brands: undefined, page: '1' });
                  }
                : undefined
            }
            compact
          >
            {activeBrands.length === 1
              ? activeBrands[0]
              : activeBrands.length > 1
                ? `Brand (${activeBrands.length})`
                : 'Brand'}
          </Chip>

          {/* Product type filter */}
          <Chip
            icon="shape"
            selected={activeProductTypes.length > 0}
            mode={activeProductTypes.length > 0 ? 'flat' : 'outlined'}
            onPress={() => setTypeModalVisible(true)}
            onClose={
              activeProductTypes.length > 0
                ? () => {
                    updateParams({ types: undefined, page: '1' });
                  }
                : undefined
            }
            compact
          >
            {activeProductTypes.length === 1
              ? activeProductTypes[0]
              : activeProductTypes.length > 1
                ? `Type (${activeProductTypes.length})`
                : 'Type'}
          </Chip>
        </ScrollView>

        <FilterSelectionModal
          visible={brandModalVisible}
          onDismiss={() => setBrandModalVisible(false)}
          title="Filter by Brand"
          items={brandResults ?? []}
          isLoading={brandsLoading}
          selectedValues={activeBrands}
          onSelectionChange={(v) => {
            updateParams({ brands: v.length ? v.join(',') : undefined, page: '1' });
          }}
          searchQuery={brandSearch}
          onSearchChange={setBrandSearch}
          searchPlaceholder="Search brands…"
        />
        <FilterSelectionModal
          visible={typeModalVisible}
          onDismiss={() => setTypeModalVisible(false)}
          title="Filter by Product Type"
          items={typeResults ?? []}
          isLoading={typesLoading}
          selectedValues={activeProductTypes}
          onSelectionChange={(v) => {
            updateParams({ types: v.length ? v.join(',') : undefined, page: '1' });
          }}
          searchQuery={typeSearch}
          onSearchChange={setTypeSearch}
          searchPlaceholder="Search types…"
        />

        {/* Error State */}
        {error && (
          <View
            style={{
              padding: 16,
              backgroundColor: theme.colors.errorContainer,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={24} color={theme.colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onErrorContainer, fontWeight: 'bold' }}>Load Failed</Text>
              <Text style={{ color: theme.colors.onErrorContainer, opacity: 0.8, fontSize: 13 }}>{String(error)}</Text>
            </View>
            <Button
              mode="contained-tonal"
              onPress={() => refetch()}
              accessibilityLabel="Retry loading products"
              compact
            >
              Retry
            </Button>
          </View>
        )}
      </View>

      {/* Product List */}
      <View style={{ flex: 1 }}>
        {isLoading && productList.length === 0 ? (
          <View style={{ flex: 1 }}>
            <FlatList
              data={Array.from({ length: 8 })}
              keyExtractor={(_, i) => `skeleton-${i}`}
              renderItem={() => <ProductCardSkeleton />}
              scrollEnabled={false}
            />
            {slowLoading && (
              <View style={{ position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' }}>
                <Card
                  style={{ backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 16, paddingVertical: 8 }}
                >
                  <Text variant="bodySmall">This is taking longer than usual. Please wait...</Text>
                </Card>
              </View>
            )}
          </View>
        ) : (
          <FlatList
            onScroll={onScroll}
            scrollEventThrottle={16}
            refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
            data={productList}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <ProductCard product={item} showOwner={filterMode === 'all'} />}
            ListFooterComponent={
              <ListFooter
                isDesktopWeb={isDesktopWeb}
                hasMore={hasMore}
                productCount={productList.length}
                total={total}
                isFetching={isFetching}
                page={page}
                totalPages={totalPages}
                setPage={(p) => updateParams({ page: String(p) })}
              />
            }
            ListEmptyComponent={
              <View style={{ padding: 20, alignItems: 'center' }}>
                {searchQuery ? (
                  <Text>No products found matching your search.</Text>
                ) : !isAuthenticated ? (
                  <Text>No products available yet. Sign in to add your own.</Text>
                ) : filterMode === 'mine' ? (
                  <View style={styles.emptyStateBody}>
                    <Text style={styles.emptyStateText}>You haven&apos;t created any products yet. Tap the </Text>
                    <NewProductPill />
                    <Text style={styles.emptyStateText}> button to create your first one!</Text>
                  </View>
                ) : (
                  <View style={styles.emptyStateBody}>
                    <Text style={styles.emptyStateText}>No products yet. Start by tapping the </Text>
                    <NewProductPill />
                    <Text style={styles.emptyStateText}> button to create your first one!</Text>
                  </View>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Gradient sits after the FlatList so it renders on top of cards — fades them at the boundary */}
      {headerBottom > 0 && (
        <LinearGradient
          colors={[bgOverlay, 'transparent']}
          style={{
            position: 'absolute',
            top: headerBottom,
            left: 0,
            right: 0,
            height: 40,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* New Product FAB */}

      <AnimatedFAB
        icon="plus"
        label="New Product"
        extended={fabExtended}
        onPress={() => {
          if (isAuthenticated) return newProduct();
          dialog.alert({
            title: 'Sign in to create products',
            message: 'Sign in to add new products and access your personal product list.',
            buttons: [
              { text: 'Cancel' },
              { text: 'Sign in', onPress: () => router.push('/login?redirectTo=/products') },
            ],
          });
        }}
        style={[
          {
            position: 'absolute',
            margin: 16,
            right: 0,
            bottom: 0,
            opacity: isAuthenticated ? 1 : 0.65,
            zIndex: 1,
            elevation: 1,
          },
          showInfoCard === true && isAuthenticated
            ? {
                borderWidth: 1,
                borderColor: theme.colors.primaryContainer,
                shadowColor: theme.colors.primary,
                shadowOpacity: 0.22,
                shadowRadius: 10,
                elevation: 8,
              }
            : null,
        ]}
        accessibilityLabel={isAuthenticated ? 'Create new product' : 'Sign in to create products'}
      />
    </>
  );
}

const styles = {
  welcomeCard: {
    marginHorizontal: 0,
    borderRadius: 24,
    overflow: 'hidden' as const,
  },
  welcomeCardContent: {
    gap: 12,
  },
  welcomeHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  welcomeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  welcomeTitle: {
    fontSize: 19,
    fontWeight: '800' as const,
    lineHeight: 24,
  },
  welcomeBody: {
    gap: 0,
  },
  welcomeSentence: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
  },
  welcomeBodyText: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  inlineButtonPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'center' as const,
  },
  inlineButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  inlineProfilePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    alignSelf: 'center' as const,
  },
  inlineProfileText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  emptyStateBody: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  welcomeTextBlock: {
    flex: 1,
  },
  welcomeActions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
};
