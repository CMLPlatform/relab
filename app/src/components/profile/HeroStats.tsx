import type { RefObject } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Skeleton } from '@/components/base/Skeleton';
import { Badge } from '@/components/base/ui/badge';
import { Text } from '@/components/base/ui/text';
import { radius } from '@/constants';
import type { PublicProfileView } from '@/services/api/profiles';
import { useAppTheme } from '@/theme';
import type { User } from '@/types/User';
import { createProfileSectionStyles } from './styles';

type ProfileHeroProps = {
  profile: User;
  onEditUsername: () => void;
  /** Return-focus target for the edit-username dialog; see AppDialog's `triggerRef`. */
  usernameEditTriggerRef?: RefObject<View | null>;
};

/** Account page header: identity block in the same spec-sheet voice as the product SpecHeader. */
export function ProfileHero({ profile, onEditUsername, usernameEditTriggerRef }: ProfileHeroProps) {
  return (
    <View className="gap-2 px-4 py-3">
      <AppText variant="eyebrow">Hi,</AppText>
      <Pressable
        ref={usernameEditTriggerRef}
        onPress={onEditUsername}
        accessibilityRole="button"
        accessibilityLabel="Edit username"
      >
        <AppText
          variant="display"
          numberOfLines={Platform.OS === 'web' ? undefined : 1}
          adjustsFontSizeToFit
        >
          {`${profile.username}.`}
        </AppText>
      </Pressable>

      <AppText variant="body" className="text-muted-foreground">
        {profile.email}
      </AppText>

      <View className="flex-row flex-wrap gap-2 mt-1">
        {profile.isActive ? (
          <Badge variant="outline">
            <Text className="text-manila font-medium">Active</Text>
          </Badge>
        ) : (
          <Badge variant="outline">
            <Text className="text-muted-foreground">Inactive</Text>
          </Badge>
        )}
        {profile.isSuperuser ? (
          <Badge variant="outline">
            <Text className="text-manila font-medium">Superuser</Text>
          </Badge>
        ) : null}
        {profile.isVerified ? (
          <Badge variant="outline">
            <Text className="text-manila font-medium">Verified</Text>
          </Badge>
        ) : (
          <Badge variant="outline">
            <Text className="text-muted-foreground">Unverified</Text>
          </Badge>
        )}
      </View>
    </View>
  );
}

type ProfileStatsSectionProps = {
  ownStats: PublicProfileView | null;
  statsLoading: boolean;
};

function StatCard({
  label,
  value,
  loading = false,
  singleLine = false,
}: {
  label: string;
  value: string | number;
  loading?: boolean;
  singleLine?: boolean;
}) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
  return (
    <View className="flex-1 items-center rounded-lg p-2.5" style={styles.statItem}>
      {loading ? (
        <Skeleton
          testID="stat-value-skeleton"
          style={[statSkeletonStyles.value, { backgroundColor: theme.colors.surfaceVariant }]}
        />
      ) : (
        <AppText variant="heading" className="font-bold" numberOfLines={singleLine ? 1 : undefined}>
          {value}
        </AppText>
      )}
      <AppText variant="eyebrow" className="mt-0.5">
        {label}
      </AppText>
    </View>
  );
}

// Skeleton wraps reanimated's Animated.View, which takes className as a
// silent no-op — this stays style-driven. Sized to the heading step's line
// height (24) so swapping in the real value doesn't shift layout.
const statSkeletonStyles = StyleSheet.create({
  value: {
    width: 28,
    height: 24,
    borderRadius: radius.control,
  },
});

export function ProfileStatsSection({ ownStats, statsLoading }: ProfileStatsSectionProps) {
  return (
    <View className="flex-row gap-2 px-3 py-4">
      <StatCard label="Products" value={ownStats?.product_count ?? 0} loading={statsLoading} />
      <StatCard label="Photos" value={ownStats?.image_count ?? 0} loading={statsLoading} />
      <StatCard label="Weight (kg)" value={ownStats?.total_weight_kg ?? 0} loading={statsLoading} />
      <StatCard
        label="Top category"
        value={ownStats?.top_category ?? 'None'}
        loading={statsLoading}
        singleLine
      />
    </View>
  );
}
