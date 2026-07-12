import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo } from 'react';
import {
  type DimensionValue,
  FlatList,
  type FlatListProps,
  RefreshControl,
  View,
} from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import ProductCard from '@/components/product/ProductCard';
import ProductCardSkeleton from '@/components/product/ProductCardSkeleton';
import type { ProductFilter } from '@/features/products/useProductsScreen';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';
import { NewProductPill } from './InlinePills';
import { PAGE_SIZE, productsScreenStyles as styles } from './shared';

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  total: number;
  isFetching: boolean;
  setPage: (page: number) => void;
};

type ProductsHeaderFadeProps = {
  headerBottom: number;
  overlayColor: string;
};

type ProductsListContentProps = {
  numColumns: number;
  productList: Product[];
  filterMode: ProductFilter;
  isFetching: boolean;
  isLoading: boolean;
  slowLoading: boolean;
  total: number;
  totalPages: number;
  hasMore: boolean;
  effectivePage: number;
  searchQuery: string;
  isAuthenticated: boolean;
  onScroll: FlatListProps<Product>['onScroll'];
  onRefresh: () => void;
  onSetPage: (page: number) => void;
};

function PaginationControls({
  page,
  totalPages,
  total,
  isFetching,
  setPage,
}: PaginationControlsProps) {
  const goPrev = useCallback(() => setPage(page - 1), [setPage, page]);
  const goNext = useCallback(() => setPage(page + 1), [setPage, page]);

  if (totalPages <= 1) return null;

  const getPageNumbers = (): (number | 'ellipsis-start' | 'ellipsis-end')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];
    if (page > 3) pages.push('ellipsis-start');

    for (
      let currentPage = Math.max(2, page - 1);
      currentPage <= Math.min(totalPages - 1, page + 1);
      currentPage += 1
    ) {
      pages.push(currentPage);
    }

    if (page < totalPages - 2) pages.push('ellipsis-end');
    pages.push(totalPages);
    return pages;
  };

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <View style={styles.paginationContainer}>
      <Text style={styles.paginationSummary}>
        Page {page} of {totalPages}; Showing {start.toLocaleString()}-{end.toLocaleString()} of{' '}
        {total.toLocaleString()} products
      </Text>
      <View style={styles.paginationActions}>
        <Button
          mode="outlined"
          compact
          onPress={goPrev}
          disabled={page <= 1 || isFetching}
          accessibilityLabel="Previous page"
        >
          Previous
        </Button>
        {getPageNumbers().map((pageValue) =>
          pageValue === 'ellipsis-start' || pageValue === 'ellipsis-end' ? (
            <Text key={pageValue} style={styles.paginationEllipsis}>
              …
            </Text>
          ) : (
            <PageButton
              key={pageValue}
              pageValue={pageValue}
              currentPage={page}
              isFetching={isFetching}
              setPage={setPage}
            />
          ),
        )}
        <Button
          mode="outlined"
          compact
          onPress={goNext}
          disabled={page >= totalPages || isFetching}
          accessibilityLabel="Next page"
        >
          Next
        </Button>
      </View>
    </View>
  );
}

function PageButton({
  pageValue,
  currentPage,
  isFetching,
  setPage,
}: {
  pageValue: number;
  currentPage: number;
  isFetching: boolean;
  setPage: (page: number) => void;
}) {
  const handlePress = useCallback(() => setPage(pageValue), [setPage, pageValue]);

  return (
    <Button
      mode={pageValue === currentPage ? 'contained' : 'outlined'}
      compact
      onPress={handlePress}
      disabled={isFetching}
      accessibilityLabel={`Page ${pageValue}`}
    >
      {String(pageValue)}
    </Button>
  );
}

function ProductsListFooter({
  isDesktopWeb,
  hasMore,
  productCount,
  total,
  isFetching,
  page,
  totalPages,
  setPage,
}: {
  isDesktopWeb: boolean;
  hasMore: boolean;
  productCount: number;
  total: number;
  isFetching: boolean;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
}) {
  const loadMore = useCallback(() => setPage(page + 1), [setPage, page]);

  if (isDesktopWeb) {
    return (
      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        isFetching={isFetching}
        setPage={setPage}
      />
    );
  }

  if (!hasMore && productCount > 0) {
    return (
      <View style={styles.footerSummary}>
        <Text style={styles.footerSummaryText}>All {total.toLocaleString()} products shown</Text>
      </View>
    );
  }

  if (!hasMore) return null;

  return (
    <View style={styles.loadMoreContainer}>
      <Text style={styles.loadMoreSummary}>
        Showing {productCount.toLocaleString()} of {total.toLocaleString()}
      </Text>
      {isFetching ? (
        <ActivityIndicator size="small" />
      ) : (
        <Button
          mode="outlined"
          onPress={loadMore}
          disabled={isFetching}
          accessibilityLabel="Load more products"
        >
          Load more
        </Button>
      )}
    </View>
  );
}

export function ProductsListContent({
  numColumns,
  productList,
  filterMode,
  isFetching,
  isLoading,
  slowLoading,
  total,
  totalPages,
  hasMore,
  effectivePage,
  searchQuery,
  isAuthenticated,
  onScroll,
  onRefresh,
  onSetPage,
}: ProductsListContentProps) {
  const theme = useAppTheme();
  const showOwner = filterMode === 'all';

  const renderSkeleton = useCallback(() => <ProductCardSkeleton />, []);
  const renderProduct = useCallback(
    ({ item }: { item: (typeof productList)[number] }) => (
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
        isDesktopWeb={numColumns > 1}
        hasMore={hasMore}
        productCount={productList.length}
        total={total}
        isFetching={isFetching}
        page={effectivePage}
        totalPages={totalPages}
        setPage={onSetPage}
      />
    ),
    [
      effectivePage,
      hasMore,
      isFetching,
      numColumns,
      onSetPage,
      productList.length,
      total,
      totalPages,
    ],
  );

  if (isLoading && productList.length === 0) {
    return (
      <View style={styles.listContainer}>
        <FlatList
          data={Array.from({ length: 8 })}
          keyExtractor={skeletonKeyExtractor}
          renderItem={renderSkeleton}
          scrollEnabled={false}
        />
        {slowLoading ? (
          <View style={styles.slowLoadingOverlay}>
            <Card
              style={[styles.slowLoadingCard, { backgroundColor: theme.colors.surfaceVariant }]}
            >
              <Text variant="bodySmall">This is taking longer than usual. Please wait…</Text>
            </Card>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <FlatList
      key={numColumns}
      numColumns={numColumns}
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
      data={productList}
      extraData={showOwner}
      keyExtractor={productKeyExtractor}
      renderItem={renderProduct}
      ListFooterComponent={listFooter}
      ListEmptyComponent={
        <View style={styles.emptyStateContainer}>
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
            <Text>No products match your search.</Text>
          ) : !isAuthenticated ? (
            <Text>No products available yet. Sign in to add your own.</Text>
          ) : filterMode === 'mine' ? (
            <View style={styles.emptyStateBody}>
              <Text style={styles.emptyStateText}>
                You haven&apos;t created any products yet. Tap the{' '}
              </Text>
              <NewProductPill />
              <Text style={styles.emptyStateText}> button to add your first one.</Text>
            </View>
          ) : (
            <View style={styles.emptyStateBody}>
              <Text style={styles.emptyStateText}>No products yet. Tap the </Text>
              <NewProductPill />
              <Text style={styles.emptyStateText}> button to add the first one.</Text>
            </View>
          )}
        </View>
      }
    />
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
