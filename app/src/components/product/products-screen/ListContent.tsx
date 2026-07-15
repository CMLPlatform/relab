import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  type DimensionValue,
  FlatList,
  type FlatListProps,
  RefreshControl,
  View,
} from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
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
      <AppText style={styles.paginationSummary}>
        Page {page} of {totalPages}; Showing {start.toLocaleString()}-{end.toLocaleString()} of{' '}
        {total.toLocaleString()} products
      </AppText>
      <View style={styles.paginationActions}>
        <AppButton
          variant="outline"
          onPress={goPrev}
          disabled={page <= 1 || isFetching}
          accessibilityLabel="Previous page"
        >
          Previous
        </AppButton>
        {getPageNumbers().map((pageValue) =>
          pageValue === 'ellipsis-start' || pageValue === 'ellipsis-end' ? (
            <AppText key={pageValue} style={styles.paginationEllipsis}>
              …
            </AppText>
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
        <AppButton
          variant="outline"
          onPress={goNext}
          disabled={page >= totalPages || isFetching}
          accessibilityLabel="Next page"
        >
          Next
        </AppButton>
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
    <AppButton
      variant={pageValue === currentPage ? 'primary' : 'outline'}
      onPress={handlePress}
      disabled={isFetching}
      accessibilityLabel={`Page ${pageValue}`}
    >
      {String(pageValue)}
    </AppButton>
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
        <AppText style={styles.footerSummaryText}>
          All {total.toLocaleString()} products shown
        </AppText>
      </View>
    );
  }

  if (!hasMore) return null;

  return (
    <View style={styles.loadMoreContainer}>
      <AppText style={styles.loadMoreSummary}>
        Showing {productCount.toLocaleString()} of {total.toLocaleString()}
      </AppText>
      {isFetching ? (
        <ActivityIndicator size="small" />
      ) : (
        <AppButton
          variant="outline"
          onPress={loadMore}
          disabled={isFetching}
          accessibilityLabel="Load more products"
        >
          Load more
        </AppButton>
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
              <AppText style={{ fontSize: 12 }}>
                This is taking longer than usual. Please wait…
              </AppText>
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
            <AppText>No products match your search.</AppText>
          ) : !isAuthenticated ? (
            <AppText>No products available yet. Sign in to add your own.</AppText>
          ) : filterMode === 'mine' ? (
            <View style={styles.emptyStateBody}>
              <AppText style={styles.emptyStateText}>
                You haven&apos;t created any products yet. Tap the{' '}
              </AppText>
              <NewProductPill />
              <AppText style={styles.emptyStateText}> button to add your first one.</AppText>
            </View>
          ) : (
            <View style={styles.emptyStateBody}>
              <AppText style={styles.emptyStateText}>No products yet. Tap the </AppText>
              <NewProductPill />
              <AppText style={styles.emptyStateText}> button to add the first one.</AppText>
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
