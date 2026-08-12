import Head from 'expo-router/head';
import { useCallback, useRef } from 'react';
import { type LayoutChangeEvent, type TextInput, useWindowDimensions, View } from 'react-native';
import { PageContainer } from '@/components/base/PageContainer';
import {
  ProductsErrorBanner,
  ProductsFab,
} from '@/components/product/products-screen/FeedbackControls';
import { ProductsFilterBar } from '@/components/product/products-screen/FilterBar';
import {
  ProductsHeaderFade,
  ProductsListContent,
} from '@/components/product/products-screen/ListContent';
import { ProductsSearchToolbar } from '@/components/product/products-screen/Toolbar';
import { ProductsWelcomeCard } from '@/components/product/products-screen/WelcomeCard';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { productGridColumns } from '@/features/products/productGridColumns';
import { PRODUCT_SORT_OPTIONS } from '@/features/products/queries';
import { useProductSearchShortcut } from '@/features/products/useProductSearchShortcut';
import { useProductsScreen } from '@/features/products/useProductsScreen';
import { getAppTheme } from '@/theme';

const SORT_OPTIONS = PRODUCT_SORT_OPTIONS;

export default function Products() {
  const colorScheme = useEffectiveColorScheme();
  const bgOverlay = getAppTheme(colorScheme).tokens.overlay.page;
  const { width } = useWindowDimensions();
  const numColumns = productGridColumns(width);

  const { screen, search, filters, list, actions } = useProductsScreen(numColumns);
  const searchRef = useRef<TextInput>(null);
  useProductSearchShortcut(searchRef);
  const handleGoToLogin = async () => {
    await actions.dismissWelcomeCard();
    actions.goToLogin();
  };
  const handleGoToProfile = async () => {
    await actions.dismissWelcomeCard();
    actions.goToProfile();
  };
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) =>
      list.setHeaderBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height),
    [list],
  );
  const handleRetry = useCallback(() => list.refetch(), [list]);

  return (
    <>
      <Head>
        <title>Products · Relab</title>
      </Head>
      <PageContainer phoneFullBleed>
        <View style={{ padding: 10, gap: 10 }} onLayout={handleLayout}>
          <ProductsWelcomeCard
            visible={screen.showWelcomeCard}
            isAuthenticated={screen.isAuthenticated}
            currentUser={screen.currentUser}
            onDismiss={actions.dismissWelcomeCard}
            onSignIn={handleGoToLogin}
            onGoToProfile={handleGoToProfile}
          />

          <ProductsSearchToolbar
            searchRef={searchRef}
            searchQuery={search.query}
            debouncedSearchQuery={search.debouncedQuery}
            isFetching={list.isFetching}
            searchQueryURL={search.queryFromUrl}
            sortBy={search.sortBy}
            sortOptions={SORT_OPTIONS}
            sortMenuVisible={search.sortMenuVisible}
            onSearchChange={search.setQuery}
            onClearSearch={search.clearQuery}
            onSetSortMenuVisible={search.setSortMenuVisible}
            onSortChange={search.applySort}
          />

          <ProductsFilterBar
            isAuthenticated={screen.isAuthenticated}
            filterMode={screen.filterMode}
            activeDatePreset={screen.activeDatePreset}
            activeBrands={screen.activeBrands}
            activeProductTypes={screen.activeProductTypes}
            dateMenuVisible={filters.dateMenuVisible}
            brandModalVisible={filters.brandModalVisible}
            typeModalVisible={filters.typeModalVisible}
            brandResults={filters.brandResults}
            brandsLoading={filters.brandsLoading}
            typeResults={filters.typeResults}
            typesLoading={filters.typesLoading}
            brandSearch={filters.brandSearch}
            typeSearch={filters.typeSearch}
            onToggleMine={filters.toggleMine}
            onClearMine={filters.clearMine}
            onSetDateMenuVisible={filters.setDateMenuVisible}
            onDateChange={filters.applyDatePreset}
            onSetBrandModalVisible={filters.setBrandModalVisible}
            onBrandSelectionChange={filters.applyBrandSelection}
            onSetBrandSearch={filters.setBrandSearch}
            onClearBrands={filters.clearBrands}
            onSetTypeModalVisible={filters.setTypeModalVisible}
            onTypeSelectionChange={filters.applyTypeSelection}
            onSetTypeSearch={filters.setTypeSearch}
            onClearTypes={filters.clearTypes}
          />

          <ProductsErrorBanner error={list.error} onRetry={handleRetry} />
        </View>

        <View style={{ flex: 1 }}>
          <ProductsListContent
            numColumns={numColumns}
            productList={list.productList}
            filterMode={screen.filterMode}
            isFetching={list.isFetching}
            isLoading={list.isLoading}
            slowLoading={screen.slowLoading}
            total={list.total}
            totalPages={list.totalPages}
            hasMore={list.hasMore}
            effectivePage={list.effectivePage}
            searchQuery={search.query}
            isAuthenticated={screen.isAuthenticated}
            onScroll={list.onScroll}
            onRefresh={handleRetry}
            onSetPage={list.setPage}
          />
        </View>
      </PageContainer>

      <ProductsHeaderFade headerBottom={screen.headerBottom} overlayColor={bgOverlay} />

      <ProductsFab
        extended={screen.fabExtended}
        highlight={screen.showWelcomeCard === true && screen.isAuthenticated && screen.fabExtended}
        onPress={actions.createProduct}
      />
    </>
  );
}
