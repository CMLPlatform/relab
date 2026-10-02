import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type PropsWithChildren, useCallback, useMemo, useState } from 'react';
import {
  type DimensionValue,
  FlatList,
  type FlatListProps,
  Platform,
  RefreshControl,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { FADE_ENTER } from '@/components/base/motion';
import { StaticBackground } from '@/components/base/StaticBackground';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { LoadMoreFooter } from '@/components/product/LoadMoreFooter';
import ProductCard from '@/components/product/ProductCard';
import ProductCardSkeleton from '@/components/product/ProductCardSkeleton';
import { PRODUCT_GRID_WINDOWING } from '@/features/products/productGridColumns';
import type { ProductFilter } from '@/features/products/useProductsScreen';
import { useAppTheme } from '@/theme/appThemeContext';
import type { Product } from '@/types/Product';
import { NewProductPill } from './InlinePills';
import { PRODUCTS_LIST_FAB_CLEARANCE, productsScreenStyles as styles } from './shared';

type ProductsHeaderFadeProps = {
  headerBottom: number;
  overlayColor: string;
  /** False at the top of the list, where there is nothing scrolling under the header to fade. */
  scrolled: boolean;
};

type ProductsListContentProps = {
  numColumns: number;
  products: Product[];
  filterMode: ProductFilter;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  slowLoading: boolean;
  total: number;
  hasNextPage: boolean;
  searchQuery: string;
  isAuthenticated: boolean;
  onScroll: FlatListProps<Product>['onScroll'];
  onRefresh: () => Promise<unknown>;
  onFetchNextPage: () => void;
};

function useProductsListBottomInset(): number {
  const bottomNavVisible = useBottomNavVisible();
  return (
    PRODUCTS_LIST_FAB_CLEARANCE +
    (Platform.OS === 'web' && bottomNavVisible ? BOTTOM_NAV_CLEARANCE : 0)
  );
}

// Full-text and trigram matching find nothing for a single character.
const MIN_SEARCH_LENGTH = 2;
const SKELETON_KEYS = Array.from({ length: 8 }, (_, index) => `skeleton-${index}`);

/** Same column grid as the loaded list, so the swap to cards does not reflow into a grid. */
function SkeletonGrid({ numColumns }: { numColumns: number }) {
  return (
    // Named and busy, like CenteredSpinner: the grey cards alone say nothing to a screen reader.
    <View
      className="flex-row flex-wrap"
      accessible
      accessibilityRole="progressbar"
      aria-busy
      accessibilityLabel="Loading products"
    >
      {SKELETON_KEYS.map((key) => (
        <GridCell key={key} numColumns={numColumns}>
          <ProductCardSkeleton />
        </GridCell>
      ))}
    </View>
  );
}

function GridCell({ numColumns, children }: PropsWithChildren<{ numColumns: number }>) {
  return <View style={{ width: `${100 / numColumns}%` as DimensionValue }}>{children}</View>;
}

export function ProductsListContent({
  numColumns,
  products,
  filterMode,
  isLoading,
  isFetchingNextPage,
  slowLoading,
  total,
  hasNextPage,
  searchQuery,
  isAuthenticated,
  onScroll,
  onRefresh,
  onFetchNextPage,
}: ProductsListContentProps) {
  const theme = useAppTheme();
  const showOwner = filterMode === 'all';
  const listBottomInset = useProductsListBottomInset();

  // Own the spinner state: RefreshControl.refreshing must reflect only a
  // user-initiated pull, never background refetches (which also flip isFetching).
  const [userRefreshing, setUserRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setUserRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setUserRefreshing(false);
    }
  }, [onRefresh]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage) onFetchNextPage();
  }, [hasNextPage, onFetchNextPage]);

  const renderProduct = useCallback(
    ({ item }: { item: (typeof products)[number] }) => (
      <GridCell numColumns={numColumns}>
        <ProductCard product={item} showOwner={showOwner} />
      </GridCell>
    ),
    [numColumns, showOwner],
  );
  const productKeyExtractor = useCallback((item: Product) => (item.id ?? 'draft').toString(), []);

  const listFooter = useMemo(
    () => (
      <LoadMoreFooter
        count={products.length}
        total={total}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onFetchNextPage}
      />
    ),
    [hasNextPage, isFetchingNextPage, onFetchNextPage, products.length, total],
  );

  if (isLoading && products.length === 0) {
    return (
      <View className="flex-1">
        <SkeletonGrid numColumns={numColumns} />
        {slowLoading ? (
          <View className="absolute right-0 bottom-[100px] left-0 items-center">
            <Card className="px-4 py-2" style={{ backgroundColor: theme.tokens.surface.sunken }}>
              <AppText variant="caption">This is taking longer than usual. Please wait…</AppText>
            </Card>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    // Fade out of the skeleton. On a flex-1 wrapper, not Animated.FlatList:
    // reanimated's web layout animations crash on FlatList hosts.
    <Animated.View
      testID="products-list-fade"
      style={styles.listFadeWrapper}
      entering={FADE_ENTER}
      key={numColumns}
    >
      <FlatList
        numColumns={numColumns}
        {...PRODUCT_GRID_WINDOWING}
        // Detaching off-screen views is a native optimisation; on web it would pull
        // cards out of the DOM that find-in-page and screen readers still expect.
        removeClippedSubviews={Platform.OS !== 'web'}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={userRefreshing} onRefresh={handleRefresh} />}
        data={products}
        extraData={showOwner}
        keyExtractor={productKeyExtractor}
        renderItem={renderProduct}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: listBottomInset, flexGrow: 1 }}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center p-5" testID="products-empty-state">
            <StaticBackground scrim={theme.tokens.overlay.hero} />
            {/* Decorative: expo-image drops an empty alt, so hide the subtree. */}
            <View aria-hidden>
              <Image
                accessibilityIgnoresInvertColors
                source={
                  theme.dark
                    ? require('@/assets/images/wordmark-dark.png')
                    : require('@/assets/images/wordmark.png')
                }
                style={styles.emptyStateMark}
                contentFit="contain"
              />
            </View>
            {searchQuery && searchQuery.trim().length < MIN_SEARCH_LENGTH ? (
              <AppText>Type at least {MIN_SEARCH_LENGTH} characters to search.</AppText>
            ) : searchQuery ? (
              <AppText>No products match your search.</AppText>
            ) : !isAuthenticated ? (
              <AppText>No products available yet. Sign in to add your own.</AppText>
            ) : filterMode === 'mine' ? (
              <View className="flex-row flex-wrap items-center justify-center">
                <AppText style={styles.emptyStateText}>
                  You haven&apos;t created any products yet. Tap the{' '}
                </AppText>
                <NewProductPill />
                <AppText style={styles.emptyStateText}> button to add your first one.</AppText>
              </View>
            ) : (
              <View className="flex-row flex-wrap items-center justify-center">
                <AppText style={styles.emptyStateText}>No products yet. Tap the </AppText>
                <NewProductPill />
                <AppText style={styles.emptyStateText}> button to add the first one.</AppText>
              </View>
            )}
          </View>
        }
      />
    </Animated.View>
  );
}

export function ProductsHeaderFade({
  headerBottom,
  overlayColor,
  scrolled,
}: ProductsHeaderFadeProps) {
  // At rest the fade sat over the first row of cards and greyed their titles.
  if (headerBottom <= 0 || !scrolled) return null;

  return (
    <LinearGradient
      colors={[overlayColor, 'transparent']}
      style={[
        styles.headerFade,
        {
          top: headerBottom,
        },
      ]}
    />
  );
}
