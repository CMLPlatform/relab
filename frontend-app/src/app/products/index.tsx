// Products list moved here from app/index.tsx

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  type DimensionValue,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  AnimatedFAB,
  Button,
  Card,
  Chip,
  IconButton,
  Menu,
  Searchbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { useDialog } from '@/components/common/DialogProvider';
import FilterSelectionModal from '@/components/common/FilterSelectionModal';
import ProductCard from '@/components/common/ProductCard';
import ProductCardSkeleton from '@/components/common/ProductCardSkeleton';
import { useEffectiveColorScheme } from '@/context/ThemeModeProvider';
import { PRODUCT_SORT_OPTIONS } from '@/hooks/useProductQueries';
import { useProductsScreen } from '@/hooks/useProductsScreen';

const PAGE_SIZE = 24;

const DATE_PRESETS = [
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 90d', days: 90 },
] as const;

const SORT_OPTIONS = PRODUCT_SORT_OPTIONS;

// ─── Sub-components ────────────────────────────────────────────────────────────

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  total: number;
  isFetching: boolean;
  setPage: (page: number) => void;
};

function PaginationControls({
  page,
  totalPages,
  total,
  isFetching,
  setPage,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const getPageNumbers = (): (number | 'ellipsis-start' | 'ellipsis-end')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];
    if (page > 3) pages.push('ellipsis-start');
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
      pages.push(p);
    }
    if (page < totalPages - 2) pages.push('ellipsis-end');
    pages.push(totalPages);
    return pages;
  };

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <View style={{ padding: 16, alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 14, opacity: 0.7 }}>
        Page {page} of {totalPages}; Showing {start.toLocaleString()}–{end.toLocaleString()} of{' '}
        {total.toLocaleString()} products
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <Button
          mode="outlined"
          compact
          onPress={() => setPage(page - 1)}
          disabled={page <= 1 || isFetching}
          accessibilityLabel="Previous page"
        >
          Previous
        </Button>
        {getPageNumbers().map((p) =>
          p === 'ellipsis-start' || p === 'ellipsis-end' ? (
            <Text key={p} style={{ paddingHorizontal: 4 }}>
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
      <Text style={[styles.inlineButtonText, { color: theme.colors.onPrimaryContainer }]}>
        New Product
      </Text>
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
      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        isFetching={isFetching}
        setPage={setPage}
      />
    );
  }

  // Mobile web and native: unified load-more pattern with counter
  if (!hasMore && productCount > 0) {
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <Text style={{ opacity: 0.6 }}>All {total.toLocaleString()} products shown</Text>
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
  const dialog = useDialog();
  const theme = useTheme();
  const colorScheme = useEffectiveColorScheme();
  const bgOverlay = colorScheme === 'light' ? 'rgba(242, 242, 242, 0.95)' : 'rgba(10,10,10,0.90)';
  const router = useRouter();
  const { width } = useWindowDimensions();
  const numColumns = width < 600 ? 1 : width < 1000 ? 2 : 3;
  const {
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
  } = useProductsScreen(numColumns);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <View
        style={{ padding: 10, gap: 10 }}
        onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        {/* Welcome banner shown on first visit */}
        {showInfoCard === true && (
          <Card
            mode="contained"
            style={[styles.welcomeCard, { backgroundColor: theme.colors.surfaceVariant }]}
          >
            <Card.Content style={styles.welcomeCardContent}>
              <View style={styles.welcomeHeaderRow}>
                <View
                  style={[styles.welcomeIcon, { backgroundColor: theme.colors.primaryContainer }]}
                >
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
                    <Text style={styles.welcomeBodyText}>
                      {' '}
                      button to add products, and manage your{' '}
                    </Text>
                    <ProfilePill />
                    <Text style={styles.welcomeBodyText}> anytime.</Text>
                  </View>
                ) : (
                  <View style={styles.welcomeSentence}>
                    <Text style={styles.welcomeBodyText}>
                      You can browse products and manage your
                    </Text>
                    <ProfilePill />
                    <Text style={styles.welcomeBodyText}>
                      . Once your email is verified, you can use the{' '}
                    </Text>
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

        {/* Search Bar + Sort + Mine toggle */}
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
            {SORT_OPTIONS.filter((opt) => searchQueryURL || opt.value[0] !== 'rank').map((opt) => (
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
          {/* Mine filter — only for authenticated users */}
          {isAuthenticated && (
            <Chip
              icon="account"
              selected={filterMode === 'mine'}
              mode={filterMode === 'mine' ? 'flat' : 'outlined'}
              onPress={() =>
                updateParams({ filterMode: filterMode === 'mine' ? 'all' : 'mine', page: '1' })
              }
              onClose={
                filterMode === 'mine'
                  ? () => updateParams({ filterMode: 'all', page: '1' })
                  : undefined
              }
              compact
              accessibilityLabel={
                filterMode === 'mine' ? 'Show all products' : 'Show only my products'
              }
            >
              Mine
            </Chip>
          )}

          {/* Date preset — single chip with dropdown */}
          <Menu
            visible={dateMenuVisible}
            onDismiss={() => setDateMenuVisible(false)}
            anchor={
              <Chip
                icon="calendar"
                selected={activeDatePreset !== null}
                mode={activeDatePreset !== null ? 'flat' : 'outlined'}
                onPress={() => setDateMenuVisible(true)}
                onClose={
                  activeDatePreset !== null
                    ? () => updateParams({ days: undefined, page: '1' })
                    : undefined
                }
                compact
              >
                {DATE_PRESETS.find((p) => p.days === activeDatePreset)?.label ?? 'Date'}
              </Chip>
            }
          >
            {DATE_PRESETS.map((preset) => (
              <Menu.Item
                key={preset.days}
                title={preset.label}
                trailingIcon={activeDatePreset === preset.days ? 'check' : undefined}
                onPress={() => {
                  const newDays =
                    activeDatePreset === preset.days ? undefined : String(preset.days);
                  updateParams({ days: newDays, page: '1' });
                  setDateMenuVisible(false);
                }}
              />
            ))}
          </Menu>

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
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={24}
              color={theme.colors.error}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onErrorContainer, fontWeight: 'bold' }}>
                Load Failed
              </Text>
              <Text style={{ color: theme.colors.onErrorContainer, opacity: 0.8, fontSize: 13 }}>
                {String(error)}
              </Text>
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
              <View
                style={{
                  position: 'absolute',
                  bottom: 100,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                }}
              >
                <Card
                  style={{
                    backgroundColor: theme.colors.surfaceVariant,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                >
                  <Text variant="bodySmall">This is taking longer than usual. Please wait...</Text>
                </Card>
              </View>
            )}
          </View>
        ) : (
          <FlatList
            key={numColumns}
            numColumns={numColumns}
            onScroll={onScroll}
            scrollEventThrottle={16}
            refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
            data={productList}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={{ width: `${100 / numColumns}%` as DimensionValue }}>
                <ProductCard product={item} showOwner={filterMode === 'all'} />
              </View>
            )}
            ListFooterComponent={
              <ListFooter
                isDesktopWeb={numColumns > 1}
                hasMore={hasMore}
                productCount={productList.length}
                total={total}
                isFetching={isFetching}
                page={effectivePage}
                totalPages={totalPages}
                setPage={(p) =>
                  numColumns === 1 ? setMobilePage(p) : updateParams({ page: String(p) })
                }
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
                    <Text style={styles.emptyStateText}>
                      You haven&apos;t created any products yet. Tap the{' '}
                    </Text>
                    <NewProductPill />
                    <Text style={styles.emptyStateText}> button to create your first one!</Text>
                  </View>
                ) : (
                  <View style={styles.emptyStateBody}>
                    <Text style={styles.emptyStateText}>
                      No products yet. Start by tapping the{' '}
                    </Text>
                    <NewProductPill />
                    <Text style={styles.emptyStateText}> button to create your first one!</Text>
                  </View>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Gradient sits after the FlatList so it renders on top of cards; fades them at the boundary */}
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
        style={{
          position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
          right: 16,
          bottom: 16,
          opacity: isAuthenticated ? 1 : 0.65,
          zIndex: 31,
          elevation: 12,
          margin: 0,
          borderWidth: showInfoCard === true && isAuthenticated && fabExtended ? 1 : 0,
          borderColor:
            showInfoCard === true && isAuthenticated && fabExtended
              ? theme.colors.primaryContainer
              : 'transparent',
          shadowColor:
            showInfoCard === true && isAuthenticated && fabExtended
              ? theme.colors.primary
              : undefined,
          shadowOpacity: showInfoCard === true && isAuthenticated && fabExtended ? 0.22 : 0,
          shadowRadius: showInfoCard === true && isAuthenticated && fabExtended ? 10 : 0,
        }}
        accessibilityLabel={isAuthenticated ? 'Create new product' : 'Sign in to create products'}
      />
    </>
  );
}

const styles = StyleSheet.create({
  welcomeCard: {
    marginHorizontal: 0,
    borderRadius: 24,
  },
  welcomeCardContent: {
    gap: 12,
  },
  welcomeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  welcomeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 24,
  },
  welcomeBody: {
    gap: 0,
  },
  welcomeSentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
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
    alignSelf: 'center',
  },
  inlineButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inlineProfilePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
  },
  inlineProfileText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyStateBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
});
