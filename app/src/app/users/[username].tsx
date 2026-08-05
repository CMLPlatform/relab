import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { Icon, type IconName } from '@/components/base/Icon';
import { PageContainer } from '@/components/base/PageContainer';
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
    <Card className="flex-1 min-w-[140px] max-w-[200px] items-center">
      <View className="items-center py-4">
        <Icon name={icon} size={32} color={color} />
        <AppText className="mt-3 mb-1 font-bold" style={styles.statValue} numberOfLines={1}>
          {value}
        </AppText>
        <AppText className="text-center opacity-70" style={styles.statLabel}>
          {label}
        </AppText>
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
            <View className="flex-1 justify-center items-center mt-16">
              <Icon name="account-cancel-outline" size={48} color={theme.colors.error} />
              <AppText className="mt-4 text-center">{errorMessage}</AppText>
            </View>
          ) : null}

          {!(loading || hasError) && profile ? (
            <View className="mt-8 items-center">
              <View className="items-center mb-12">
                <View
                  className="w-[120px] h-[120px] rounded-full justify-center items-center mb-6"
                  style={styles.avatarPlaceholder}
                >
                  <AppText variant="plain" className="font-bold" style={styles.avatarText}>
                    {profile.username.substring(0, 2).toUpperCase()}
                  </AppText>
                </View>
                <AppText
                  variant="plain"
                  className="font-extrabold mb-2"
                  style={styles.usernameText}
                >
                  {profile.username}
                </AppText>
                {profile.created_at ? (
                  <AppText variant="plain" className="opacity-60" style={styles.joinedText}>
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
    avatarPlaceholder: {
      backgroundColor: theme.colors.primaryContainer,
    },
    avatarText: {
      fontSize: 48,
      color: theme.colors.onPrimaryContainer,
    },
    usernameText: {
      fontSize: 32,
    },
    joinedText: {
      fontSize: 15,
    },
    statValue: {
      fontSize: 28,
    },
    statLabel: {
      fontSize: 13,
    },
  }),
);
