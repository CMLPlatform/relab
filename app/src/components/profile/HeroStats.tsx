import type { RefObject } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Badge } from '@/components/base/ui/badge';
import { Text } from '@/components/base/ui/text';
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

      <AppText variant="body" className="opacity-70">
        {profile.email}
      </AppText>

      <View className="flex-row flex-wrap gap-2 mt-1">
        {profile.isActive ? (
          <Badge variant="outline">
            <Text className="text-accent font-medium">Active</Text>
          </Badge>
        ) : (
          <Badge variant="outline">
            <Text className="text-muted-foreground">Inactive</Text>
          </Badge>
        )}
        {profile.isSuperuser ? (
          <Badge variant="outline">
            <Text className="text-accent font-medium">Superuser</Text>
          </Badge>
        ) : null}
        {profile.isVerified ? (
          <Badge variant="outline">
            <Text className="text-accent font-medium">Verified</Text>
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
  singleLine = false,
}: {
  label: string;
  value: string | number;
  singleLine?: boolean;
}) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <View className="flex-1 items-center rounded-lg p-2.5" style={styles.statItem}>
      <AppText variant="heading" className="font-bold" numberOfLines={singleLine ? 1 : undefined}>
        {value}
      </AppText>
      <AppText variant="eyebrow" className="mt-0.5">
        {label}
      </AppText>
    </View>
  );
}

export function ProfileStatsSection({ ownStats, statsLoading }: ProfileStatsSectionProps) {
  return (
    <View className="flex-row gap-2 px-3 py-4">
      <StatCard label="Products" value={statsLoading ? '...' : (ownStats?.product_count ?? 0)} />
      <StatCard label="Photos" value={statsLoading ? '...' : (ownStats?.image_count ?? 0)} />
      <StatCard
        label="Weight (kg)"
        value={statsLoading ? '...' : (ownStats?.total_weight_kg ?? 0)}
      />
      <StatCard
        label="Top category"
        value={statsLoading ? '...' : (ownStats?.top_category ?? 'None')}
        singleLine
      />
    </View>
  );
}
