import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  type DimensionValue,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { ErrorState } from '@/components/base/ErrorState';
import { Icon, type IconName } from '@/components/base/Icon';
import { PageContainer } from '@/components/base/PageContainer';
import ProductCard from '@/components/product/ProductCard';
import ProductCardSkeleton from '@/components/product/ProductCardSkeleton';
import { productGridColumns } from '@/features/products/productGridColumns';
import { userProductsInfiniteQueryOptions } from '@/features/products/queries';
import { usePublicProfileScreen } from '@/features/profile/usePublicProfileScreen';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';

// Local to this screen; unrelated to the HeroStats StatCard in components/profile.
function ProfileStatCard({
  icon,
  color,
  value,
  label,
}: {
  icon: IconName;
  color: string;
  value: string | number;
  label: string;
}) {
  return (
    <Card className="flex-1 min-w-[140px] max-w-[200px] items-center">
      <View className="items-center py-4">
        <Icon name={icon} size={32} color={color} />
        <AppText variant="heading" className="mt-3 mb-1 font-bold" numberOfLines={1}>
          {value}
        </AppText>
        <AppText variant="eyebrow" className="text-center">
          {label}
        </AppText>
      </View>
    </Card>
  );
}

// Plain grid inside the page ScrollView: the products-screen FlatList owns its
// own scroll, pull-to-refresh, and bottom-nav insets, none of which fit here.
function UserProducts({ username }: { username: string }) {
  const { width } = useWindowDimensions();
  const numColumns = productGridColumns(width);
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery(
    userProductsInfiniteQueryOptions(username),
  );
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return (
    <View className="w-full mt-12" testID="user-products">
      <AppText variant="eyebrow" className="mb-3" accessibilityRole="header">
        {isLoading ? 'Products' : `Products · ${total}`}
      </AppText>
      {isLoading ? (
        <ProductCardSkeleton />
      ) : items.length === 0 ? (
        <AppText className="text-muted-foreground">No public products yet</AppText>
      ) : (
        <View className="flex-row flex-wrap">
          {items.map((product) => (
            <View key={product.id} style={{ width: `${100 / numColumns}%` as DimensionValue }}>
              <ProductCard product={product} />
            </View>
          ))}
        </View>
      )}
      {hasNextPage ? (
        <View className="items-center py-4" accessibilityLiveRegion="polite">
          {isFetchingNextPage ? (
            <ActivityIndicator size="small" accessibilityLabel="Loading more products" />
          ) : (
            <AppButton variant="outline" onPress={loadMore} accessibilityLabel="Load more products">
              Load more
            </AppButton>
          )}
        </View>
      ) : null}
    </View>
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
        <title>{`${title} · Relab`}</title>
      </Head>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerClassName="flex-grow py-4">
        <PageContainer>
          {loading ? (
            <View className="flex-1 justify-center items-center mt-16">
              <ActivityIndicator
                testID="activity-indicator"
                size="large"
                color={theme.colors.primary}
              />
            </View>
          ) : null}

          {hasError ? (
            <ErrorState
              icon="user-x"
              title="Couldn't load profile"
              message={errorMessage ?? "Couldn't load profile."}
              onRetry={onRetry}
            />
          ) : null}

          {!(loading || hasError) && profile ? (
            <View className="mt-8 items-center">
              <View className="items-center mb-12">
                <View className="w-[120px] h-[120px] rounded-full justify-center items-center mb-6 bg-primary/12">
                  <AppText variant="body" className="font-bold" style={styles.avatarText}>
                    {profile.username.substring(0, 2).toUpperCase()}
                  </AppText>
                </View>
                <AppText variant="display" className="font-extrabold mb-2">
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

              <View className="w-full flex-row justify-center gap-4 flex-wrap">
                {(
                  [
                    {
                      icon: 'weight',
                      color: theme.colors.secondary,
                      value: profile.total_weight_kg,
                      label: 'Total kg',
                    },
                    {
                      icon: 'images',
                      color: theme.tokens.status.success,
                      value: profile.image_count,
                      label: 'Photos',
                    },
                    {
                      icon: 'tag',
                      color: theme.tokens.status.warning,
                      // Unset, not a penalty (PRODUCT.md): a dash, never "None".
                      value: profile.top_category || '—',
                      label: 'Top category',
                    },
                  ] as const
                ).map((stat) => (
                  <ProfileStatCard key={stat.label} {...stat} />
                ))}
              </View>

              <UserProducts username={profile.username} />
            </View>
          ) : null}
        </PageContainer>
      </ScrollView>
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
  }),
);
