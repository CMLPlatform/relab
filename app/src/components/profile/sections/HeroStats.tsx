import { Platform, Pressable, View } from 'react-native';
import { Chip } from '@/components/base/Chip';
import { Text } from '@/components/base/Text';
import { createProfileSectionStyles } from '@/components/profile/sections/styles';
import type { PublicProfileView } from '@/services/api/profiles';
import { useAppTheme } from '@/theme';
import type { User } from '@/types/User';
import { ProfileSectionHeader } from './shared';

type ProfileHeroProps = {
  profile: User;
  onEditUsername: () => void;
};

export function ProfileHero({ profile, onEditUsername }: ProfileHeroProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <View style={styles.hero}>
      <Text style={styles.hiText}>Hi,</Text>
      <Pressable
        onPress={onEditUsername}
        accessibilityRole="button"
        accessibilityLabel="Edit username"
      >
        <Text
          style={styles.usernameText}
          numberOfLines={Platform.OS === 'web' ? undefined : 1}
          adjustsFontSizeToFit
        >
          {`${profile.username}.`}
        </Text>
      </Pressable>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{profile.email}</Text>
      </View>

      <View style={styles.chipRow}>
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
      <Text style={styles.statValue} numberOfLines={singleLine ? 1 : undefined}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function ProfileStatsSection({ ownStats, statsLoading }: ProfileStatsSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <>
      <ProfileSectionHeader title="Your Stats" />
      <View style={styles.statsRow}>
        <StatCard label="Products" value={statsLoading ? '...' : (ownStats?.product_count ?? 0)} />
        <StatCard label="Photos" value={statsLoading ? '...' : (ownStats?.image_count ?? 0)} />
        <StatCard
          label="Weight (kg)"
          value={statsLoading ? '...' : (ownStats?.total_weight_kg ?? 0)}
        />
        <StatCard
          label="Top Category"
          value={statsLoading ? '...' : (ownStats?.top_category ?? 'None')}
          singleLine
        />
      </View>
    </>
  );
}
