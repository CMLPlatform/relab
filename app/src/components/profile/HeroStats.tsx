import type { RefObject } from 'react';
import { Platform, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { IconButton } from '@/components/base/IconButton';
import { SpecFacts } from '@/components/base/SpecFacts';
import { Badge } from '@/components/base/ui/badge';
import { Text } from '@/components/base/ui/text';
import type { PublicProfileView } from '@/services/api/profiles';
import type { User } from '@/types/User';
import { heading } from '@/utils/a11y';

type ProfileHeroProps = {
  profile: User;
  onEditUsername: () => void;
  /** Return-focus target for the edit-username dialog; see AppDialog's `triggerRef`. */
  usernameEditTriggerRef?: RefObject<View | null>;
};

/** Account page header: identity block in the same spec-sheet voice as the product SpecHeader. */
export function ProfileHero({ profile, onEditUsername, usernameEditTriggerRef }: ProfileHeroProps) {
  return (
    // No horizontal padding: the name shares the section cards' left edge.
    <View className="gap-2 pt-3">
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
        <IconButton
          ref={usernameEditTriggerRef}
          icon="pencil"
          size={18}
          onPress={onEditUsername}
          accessibilityLabel="Edit username"
        />
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

/** The account's own record counts, as a Spec Row under the identity block. */
export function ProfileStatsSection({ ownStats, statsLoading }: ProfileStatsSectionProps) {
  return (
    <SpecFacts
      facts={[
        { label: 'Products', value: String(ownStats?.product_count ?? 0) },
        { label: 'Photos', value: String(ownStats?.image_count ?? 0) },
        { label: 'Weight', value: `${ownStats?.total_weight_kg ?? 0} kg` },
        { label: 'Top category', value: ownStats?.top_category || '—' },
      ].map((fact) => ({ ...fact, loading: statsLoading }))}
    />
  );
}
