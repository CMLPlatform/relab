import { Platform, Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Chip } from '@/components/base/Chip';
import type { PublicProfileView } from '@/services/api/profiles';
import { useAppTheme } from '@/theme';
import type { User } from '@/types/User';
import { createProfileSectionStyles } from './styles';

type ProfileHeroProps = {
  profile: User;
  onEditUsername: () => void;
};

/** Account page header: identity block in the same spec-sheet voice as the product SpecHeader. */
export function ProfileHero({ profile, onEditUsername }: ProfileHeroProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <View className="gap-2 px-4 py-3">
      <AppText variant="label" className="opacity-60 uppercase">
        Hi,
      </AppText>
      <Pressable
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
        {profile.isActive ? <Chip>Active</Chip> : <Chip style={styles.greyChip}>Inactive</Chip>}
        {profile.isSuperuser ? <Chip>Superuser</Chip> : null}
        {profile.isVerified ? (
          <Chip>Verified</Chip>
        ) : (
          <Chip style={styles.greyChip}>Unverified</Chip>
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
    <View style={styles.statItem}>
      <AppText style={styles.statValue} numberOfLines={singleLine ? 1 : undefined}>
        {value}
      </AppText>
      <AppText style={styles.statLabel}>{label}</AppText>
    </View>
  );
}

export function ProfileStatsSection({ ownStats, statsLoading }: ProfileStatsSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <View style={styles.statsRow}>
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
