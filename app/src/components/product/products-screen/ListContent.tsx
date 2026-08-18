import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type DimensionValue,
  FlatList,
  type FlatListProps,
  Platform,
  RefreshControl,
  View,
} from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import ProductCard from '@/components/product/ProductCard';
import ProductCardSkeleton from '@/components/product/ProductCardSkeleton';
import type { ProductFilter } from '@/features/products/useProductsScreen';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';
import { NewProductPill } from './InlinePills';
import { PRODUCTS_LIST_FAB_CLEARANCE, productsScreenStyles as styles } from './shared';

type ProductsHeaderFadeProps = {
  headerBottom: number;
  overlayColor: string;
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

function ProductsListFooter({
  hasNextPage,
  isFetchingNextPage,
  productCount,
  total,
  onLoadMore,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  productCount: number;
  total: number;
  onLoadMore: () => void;
}) {
  if (productCount === 0) return null;

  return (
    // Live region so a screen reader hears the count settle after "Load more"
    // — the button keeps focus, so the newly appended cards are otherwise
    // silent and there is no cue that the page arrived.
    <View className="items-center gap-2 py-4" accessibilityLiveRegion="polite">
      {isFetchingNextPage ? (
        <ActivityIndicator size="small" accessibilityLabel="Loading more products" />
      ) : hasNextPage ? (
        <AppButton variant="outline" onPress={onLoadMore} accessibilityLabel="Load more products">
          Load more
        </AppButton>
      ) : null}
      <AppText className="text-muted-foreground">
        {productCount} of {total} products
      </AppText>
    </View>
  );
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

  const renderSkeleton = useCallback(() => <ProductCardSkeleton />, []);
  const renderProduct = useCallback(
    ({ item }: { item: (typeof products)[number] }) => (
      <View style={{ width: `${100 / numColumns}%` as DimensionValue }}>
        <ProductCard product={item} showOwner={showOwner} />
      </View>
    ),
    [numColumns, showOwner],
  );
  const skeletonKeyExtractor = useCallback((_: unknown, index: number) => `skeleton-${index}`, []);
  const productKeyExtractor = useCallback((item: Product) => (item.id ?? 'draft').toString(), []);

  const listFooter = useMemo(
    () => (
      <ProductsListFooter
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        productCount={products.length}
        total={total}
        onLoadMore={onFetchNextPage}
      />
    ),
    [hasNextPage, isFetchingNextPage, onFetchNextPage, products.length, total],
  );

  if (isLoading && products.length === 0) {
    return (
      <View className="flex-1">
        <FlatList
          data={Array.from({ length: 8 })}
          keyExtractor={skeletonKeyExtractor}
          renderItem={renderSkeleton}
          scrollEnabled={false}
        />
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
    // The fade bridges the swap out of the skeleton branch above, which
    // otherwise hard-cuts eight grey cards into eight real ones, and replays
    // when `key={numColumns}` remounts the subtree on rotation. The animation
    // lives on a flex-1 wrapper, NOT on Animated.FlatList: reanimated's web
    // layout-animation path crashes on FlatList hosts (element.style is
    // undefined in startWebLayoutAnimation -> maybeReportOverwrittenProperties,
    // blanking the whole page in the web export). flex-1 keeps the wrapper
    // layout-neutral between the list and its flex parent.
    <Animated.View
      testID="products-list-fade"
      style={styles.listFadeWrapper}
      entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
      key={numColumns}
    >
      <FlatList
        numColumns={numColumns}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={userRefreshing} onRefresh={handleRefresh} />}
        data={products}
        extraData={showOwner}
        keyExtractor={productKeyExtractor}
        renderItem={renderProduct}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: listBottomInset }}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <View className="items-center p-5">
            <Image
              source={
                theme.dark
                  ? require('@/assets/images/mark-dark.png')
                  : require('@/assets/images/mark.png')
              }
              style={styles.emptyStateMark}
              contentFit="contain"
              accessibilityLabel=""
            />
            {searchQuery ? (
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

export function ProductsHeaderFade({ headerBottom, overlayColor }: ProductsHeaderFadeProps) {
  if (headerBottom <= 0) return null;

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
