import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { type ReactNode, useCallback } from 'react';
import {
  type DimensionValue,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppText } from '@/components/base/AppText';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { ErrorState } from '@/components/base/ErrorState';
import { PageContainer } from '@/components/base/PageContainer';
import { SpecFacts } from '@/components/base/SpecFacts';
import { LoadMoreFooter } from '@/components/product/LoadMoreFooter';
import ProductCard from '@/components/product/ProductCard';
import ProductCardSkeleton from '@/components/product/ProductCardSkeleton';
import { PRODUCT_GRID_WINDOWING, productGridColumns } from '@/features/products/productGridColumns';
import { usePublicProfileScreen } from '@/features/profile/usePublicProfileScreen';
import { useUserProducts } from '@/features/profile/useUserProducts';
import type { PublicProfileView } from '@/services/api/profiles';
import { useAppTheme } from '@/theme/appThemeContext';
import { memoizeByTheme } from '@/theme/memoizeByTheme';
import type { AppTheme } from '@/theme/types';
import type { Product } from '@/types/Product';
import { heading } from '@/utils/a11y';
import { getErrorMessage } from '@/utils/errors';

function ProfileSummary({ profile }: { profile: PublicProfileView }) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  return (
    <View className="mt-8 items-center">
      <View className="items-center mb-12">
        <View className="w-[120px] h-[120px] rounded-full justify-center items-center mb-6 bg-primary/12">
          <AppText variant="body" className="font-bold" style={styles.avatarText}>
            {profile.username.substring(0, 2).toUpperCase()}
          </AppText>
        </View>
        <AppText variant="display" className="font-extrabold mb-2" {...heading(1)}>
          {profile.username}
        </AppText>
        {profile.created_at ? (
          <AppText variant="caption" className="text-muted-foreground">
            Joined{' '}
            {new Date(profile.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </AppText>
        ) : null}
      </View>

      {/* The Spec Row, as on the account screen; centred under the centred identity. */}
      <View className="self-center">
        <SpecFacts
          facts={[
            { label: 'Weight', value: `${profile.total_weight_kg} kg` },
            { label: 'Photos', value: String(profile.image_count) },
            // Unset, not a penalty (PRODUCT.md): a dash, never "None".
            { label: 'Top category', value: profile.top_category || '—' },
          ]}
        />
      </View>
    </View>
  );
}

const productKeyExtractor = (product: Product) => String(product.id);

// The profile scrolls as the header of a virtualized product grid, so a profile with
// hundreds of products mounts only the cards near the viewport. No pull-to-refresh or
// bottom-nav inset: those belong to the products tab, not to a pushed profile.
function ProfileProductList({ username, header }: { username: string; header: ReactNode }) {
  const { width } = useWindowDimensions();
  const numColumns = productGridColumns(width);
  const {
    items,
    total,
    isLoading,
    isError,
    error,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    loadMore,
  } = useUserProducts(username);
  // A failed next page keeps the items already shown; only an empty list becomes an error.
  const failed = isError && items.length === 0;

  const renderProduct = useCallback(
    ({ item }: { item: Product }) => (
      <View style={{ width: `${100 / numColumns}%` as DimensionValue }}>
        <ProductCard product={item} />
      </View>
    ),
    [numColumns],
  );

  const listHeader = (
    <>
      {header}
      <View className="w-full mt-12" testID="user-products">
        <AppText variant="eyebrow" className="mb-3" {...heading(2)}>
          {isLoading || failed ? (
            'Products'
          ) : (
            <>
              Products ·{' '}
              <AppText variant="data" className="text-muted-foreground">
                {total}
              </AppText>
            </>
          )}
        </AppText>
        {isLoading ? (
          <ProductCardSkeleton />
        ) : failed ? (
          <ErrorState
            compact
            title="Couldn't load products"
            message={getErrorMessage(error, 'Check your connection and try again.')}
            onRetry={refetch}
            actionAccessibilityLabel="Retry loading products"
          />
        ) : items.length === 0 ? (
          <AppText className="text-muted-foreground">No public products yet</AppText>
        ) : null}
      </View>
    </>
  );

  const listFooter = (
    <LoadMoreFooter
      count={items.length}
      total={total}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={loadMore}
    />
  );

  return (
    <FlatList
      // numColumns cannot change on a mounted FlatList.
      key={numColumns}
      numColumns={numColumns}
      data={items}
      keyExtractor={productKeyExtractor}
      renderItem={renderProduct}
      {...PRODUCT_GRID_WINDOWING}
      removeClippedSubviews={Platform.OS !== 'web'}
      contentContainerClassName="flex-grow py-4"
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
    />
  );
}

export default function UserProfileScreen() {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { profile, loading, hasError, errorMessage, onRetry } = usePublicProfileScreen();
  const title = profile?.username ?? 'Profile';

  return (
    <>
      <Head>
        <title>{`${title} · R9lab`}</title>
      </Head>
      {/* react-native-web renders react-navigation's header title
          (accessibilityRole "header", no aria-level) as an <h1>, which would
          compete with the username heading in the page below, and
          useScreenEntryFocus focuses the scaffold's h1. Render the chrome title
          as plain text so the screen keeps exactly one heading, the way the
          product detail screen does with ProductNameHeader. */}
      <Stack.Screen
        options={{
          title,
          headerTitle: () => (
            <AppText
              variant="body"
              numberOfLines={1}
              className="font-bold"
              style={styles.headerTitle}
            >
              {title}
            </AppText>
          ),
        }}
      />
      <PageContainer entryFocusReady={!loading}>
        {!(loading || hasError) && profile ? (
          <ProfileProductList
            username={profile.username}
            header={<ProfileSummary profile={profile} />}
          />
        ) : (
          <ScrollView contentContainerClassName="flex-grow py-4">
            {loading ? <CenteredSpinner /> : null}

            {hasError ? (
              <ErrorState
                icon="user-x"
                title="Couldn't load profile"
                message={errorMessage ?? "Couldn't load profile."}
                onRetry={onRetry}
              />
            ) : null}
          </ScrollView>
        )}
      </PageContainer>
    </>
  );
}

const createStyles = memoizeByTheme((theme: AppTheme) =>
  StyleSheet.create({
    avatarText: {
      // NOTE: avatar-initials glyph sized to fill the 120px circle; no ramp step applies.
      fontSize: 48,
      color: theme.colors.primary,
    },
    headerTitle: {
      flexShrink: 1,
      color: theme.colors.onBackground,
    },
  }),
);
