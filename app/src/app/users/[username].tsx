import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { Icon, type IconName } from '@/components/base/Icon';
import { PageContainer } from '@/components/base/PageContainer';
import { radius } from '@/constants';
import { usePublicProfileScreen } from '@/features/profile/usePublicProfileScreen';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';

type ProfileStyles = ReturnType<typeof createStyles>;

// Four stat blocks differ only in icon/color/value/label — mapped from data
// instead of hand-copied per stat. Local to this screen: unrelated to the
// HeroStats StatCard in components/profile.
function ProfileStatCard({
  icon,
  color,
  value,
  label,
  styles,
}: {
  icon: IconName;
  color: string;
  value: string | number;
  label: string;
  styles: ProfileStyles;
}) {
  return (
    <Card style={styles.statCard}>
      <View style={styles.statContent}>
        <Icon name={icon} size={32} color={color} />
        <AppText style={styles.statValue} numberOfLines={1}>
          {value}
        </AppText>
        <AppText style={styles.statLabel}>{label}</AppText>
      </View>
    </Card>
  );
}

export default function UserProfileScreen() {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { profile, loading, hasError, errorMessage, goToProducts } = usePublicProfileScreen();

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToProducts} />,
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <PageContainer>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator
                testID="activity-indicator"
                size="large"
                color={theme.colors.primary}
              />
            </View>
          ) : null}

          {hasError ? (
            <View style={styles.centerContainer}>
              <Icon name="account-cancel-outline" size={48} color={theme.colors.error} />
              <AppText variant="plain" style={styles.errorText}>
                {errorMessage}
              </AppText>
            </View>
          ) : null}

          {!(loading || hasError) && profile ? (
            <View style={styles.profileContainer}>
              <View style={styles.heroSection}>
                <View style={styles.avatarPlaceholder}>
                  <AppText variant="plain" style={styles.avatarText}>
                    {profile.username.substring(0, 2).toUpperCase()}
                  </AppText>
                </View>
                <AppText variant="plain" style={styles.usernameText}>
                  {profile.username}
                </AppText>
                {profile.created_at ? (
                  <AppText variant="plain" style={styles.joinedText}>
                    Joined{' '}
                    {new Date(profile.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </AppText>
                ) : null}
              </View>

              <View style={styles.statsSection}>
                {(
                  [
                    {
                      icon: 'package-variant-closed',
                      color: theme.colors.primary,
                      value: profile.product_count,
                      label: 'Products',
                    },
                    {
                      icon: 'weight-kilogram',
                      color: theme.colors.secondary,
                      value: profile.total_weight_kg,
                      label: 'Total kg',
                    },
                    {
                      icon: 'image-multiple',
                      color: theme.tokens.status.success,
                      value: profile.image_count,
                      label: 'Photos',
                    },
                    {
                      icon: 'tag-outline',
                      color: theme.tokens.status.warning,
                      value: profile.top_category || 'None',
                      label: 'Top category',
                    },
                  ] as const
                ).map((stat) => (
                  <ProfileStatCard key={stat.label} styles={styles} {...stat} />
                ))}
              </View>
            </View>
          ) : null}
        </PageContainer>
      </ScrollView>
    </>
  );
}

const createStyles = memoizeByTheme((theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      paddingVertical: 16,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 64,
    },
    errorText: {
      marginTop: 16,
      fontSize: 16,
      textAlign: 'center',
    },
    profileContainer: {
      marginTop: 32,
      alignItems: 'center',
    },
    heroSection: {
      alignItems: 'center',
      marginBottom: 48,
    },
    avatarPlaceholder: {
      width: 120,
      height: 120,
      borderRadius: radius.full,
      backgroundColor: theme.colors.primaryContainer,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    avatarText: {
      fontSize: 48,
      fontWeight: 'bold',
      color: theme.colors.onPrimaryContainer,
    },
    usernameText: {
      fontSize: 32,
      fontWeight: '800',
      marginBottom: 8,
    },
    joinedText: {
      fontSize: 15,
      opacity: 0.6,
    },
    statsSection: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 16,
      flexWrap: 'wrap',
    },
    statCard: {
      flex: 1,
      minWidth: 140,
      maxWidth: 200,
      alignItems: 'center',
    },
    statContent: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    statValue: {
      fontSize: 28,
      fontWeight: 'bold',
      marginTop: 12,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 13,
      opacity: 0.7,
      textAlign: 'center',
    },
  }),
);
