import { useWindowDimensions, View } from 'react-native';
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
import { useProductsScreen } from '@/hooks/products/useProductsScreen';
import { PRODUCT_SORT_OPTIONS } from '@/hooks/useProductQueries';
import { getAppTheme } from '@/theme';

const SORT_OPTIONS = PRODUCT_SORT_OPTIONS;

export default function Products() {
  const colorScheme = useEffectiveColorScheme();
  const bgOverlay = getAppTheme(colorScheme).tokens.overlay.page;
  const { width } = useWindowDimensions();
  const numColumns = width < 600 ? 1 : width < 1000 ? 2 : 3;

  const { screen, search, filters, list, actions } = useProductsScreen(numColumns);
  const handleGoToLogin = async () => {
    await actions.dismissWelcomeCard();
    actions.goToLogin();
  };
  const handleGoToProfile = async () => {
    await actions.dismissWelcomeCard();
    actions.goToProfile();
  };

  return (
    <>
      <View
        style={{ padding: 10, gap: 10 }}
        onLayout={(event) =>
          list.setHeaderBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)
        }
      >
        <ProductsWelcomeCard
          visible={screen.showWelcomeCard}
          isAuthenticated={screen.isAuthenticated}
          currentUser={screen.currentUser}
          onDismiss={actions.dismissWelcomeCard}
          onSignIn={handleGoToLogin}
          onGoToProfile={handleGoToProfile}
        />

        <ProductsSearchToolbar
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

        <ProductsErrorBanner error={list.error} onRetry={() => list.refetch()} />
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
          onRefresh={() => list.refetch()}
          onSetPage={list.setPage}
        />
      </View>

      <ProductsHeaderFade headerBottom={screen.headerBottom} overlayColor={bgOverlay} />

      <ProductsFab
        extended={screen.fabExtended}
        isAuthenticated={screen.isAuthenticated}
        highlight={screen.showWelcomeCard === true && screen.isAuthenticated && screen.fabExtended}
        onPress={actions.createProduct}
      />
    </>
  );
}
