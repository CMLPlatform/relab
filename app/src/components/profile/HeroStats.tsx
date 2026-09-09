import type { RefObject } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { Skeleton } from '@/components/base/Skeleton';
import { Badge } from '@/components/base/ui/badge';
import { Text } from '@/components/base/ui/text';
import { radius } from '@/constants';
import type { PublicProfileView } from '@/services/api/profiles';
import { useAppTheme } from '@/theme';
import type { User } from '@/types/User';
import { heading } from '@/utils/a11y';
import { createProfileSectionStyles } from './styles';

type ProfileHeroProps = {
  profile: User;
  onEditUsername: () => void;
  /** Return-focus target for the edit-username dialog; see AppDialog's `triggerRef`. */
  usernameEditTriggerRef?: RefObject<View | null>;
};

/** Account page header: identity block in the same spec-sheet voice as the product SpecHeader. */
export function ProfileHero({ profile, onEditUsername, usernameEditTriggerRef }: ProfileHeroProps) {
  const theme = useAppTheme();
  return (
    <View className="gap-2 px-4 py-3">
      {/* A greeting, not a tag value: caption, not eyebrow (DESIGN.md Eyebrow-Is-A-Datum). */}
      <AppText variant="caption" className="text-muted-foreground">
        Hi,
      </AppText>
      {/* The heading sits beside the edit control, not inside it: a button's
          content is its label, and a heading buried there leaves the screen
          without one in the outline. */}
      <View className="flex-row items-center gap-1">
        <AppText
          variant="display"
          {...heading(1)}
          numberOfLines={Platform.OS === 'web' ? undefined : 1}
          adjustsFontSizeToFit
          style={{ flexShrink: 1 }}
        >
          {profile.username}
        </AppText>
        <Pressable
          ref={usernameEditTriggerRef}
          onPress={onEditUsername}
          accessibilityRole="button"
          accessibilityLabel="Edit username"
          className="h-11 w-11 items-center justify-center"
        >
          <Icon name="pencil" size={18} color={theme.colors.onBackground} />
        </Pressable>
      </View>

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

// Skeleton wraps Animated.View, which ignores className. Sized to the heading
// line height (24) so the real value does not shift layout.
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
        value={ownStats?.top_category || '—'}
        loading={statsLoading}
        singleLine
      />
    </View>
  );
}
