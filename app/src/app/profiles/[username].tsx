import { HeaderBackButton } from '@react-navigation/elements';
import { Stack, useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Icon } from 'react-native-paper';

import { Text } from '@/components/base/Text';
import { useAuth } from '@/context/auth';
import { getPublicProfile, type PublicProfileView } from '@/services/api/profiles';
import { alpha, useAppTheme } from '@/theme';

export default function UserProfileScreen() {
  const { username } = useGlobalSearchParams();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const usernameValue = typeof username === 'string' ? username : null;
  // Auth state drives visibility — a community/private profile must refetch
  // when the viewer logs in or out so stale "allowed" views don't linger.
  const { user: viewer } = useAuth();
  const viewerId = viewer?.id ?? null;

  const [profileState, setProfileState] = useState<{
    loadedUsername: string | null;
    loadedViewerId: string | null;
    profile: PublicProfileView | null;
    error: string | null;
  }>({
    loadedUsername: null,
    loadedViewerId: null,
    profile: null,
    error: null,
  });

  useEffect(() => {
    if (!usernameValue) {
      return;
    }
    const nextUsername = usernameValue;
    const nextViewerId = viewerId;

    let cancelled = false;

    async function loadProfile() {
      try {
        const data = await getPublicProfile(nextUsername);
        if (!cancelled) {
          setProfileState({
            loadedUsername: nextUsername,
            loadedViewerId: nextViewerId,
            profile: data,
            error: null,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setProfileState({
            loadedUsername: nextUsername,
            loadedViewerId: nextViewerId,
            profile: null,
            error: err instanceof Error ? err.message : 'Failed to fetch profile.',
          });
        }
      }
    }
    const loadProfileTask = async () => {
      await loadProfile();
    };
    loadProfileTask().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [usernameValue, viewerId]);

  const matchesCurrentRequest =
    profileState.loadedUsername === usernameValue && profileState.loadedViewerId === viewerId;
  const loading = Boolean(usernameValue) && !matchesCurrentRequest;
  const profile = matchesCurrentRequest ? profileState.profile : null;
  const error = matchesCurrentRequest ? profileState.error : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerLeft: (props) => (
            <HeaderBackButton {...props} onPress={() => router.replace('/products')} />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {loading && (
          <View style={styles.centerContainer}>
            <ActivityIndicator
              testID="activity-indicator"
              size="large"
              color={theme.colors.primary}
            />
          </View>
        )}

        {error && (
          <View style={styles.centerContainer}>
            <Icon source="account-cancel-outline" size={48} color={theme.colors.error} />
            <Text style={{ ...styles.errorText, color: theme.colors.error }}>
              {error === 'Profile not found' ? 'This profile is private or does not exist.' : error}
            </Text>
          </View>
        )}

        {!(loading || error) && profile && (
          <View style={styles.profileContainer}>
            <View style={styles.heroSection}>
              <View
                style={[
                  styles.avatarPlaceholder,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Text style={[styles.avatarText, { color: theme.colors.onPrimaryContainer }]}>
                  {profile.username.substring(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.usernameText}>{profile.username}</Text>
              <Text style={styles.joinedText}>
                Joined{' '}
                {new Date(profile.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>

            <View style={styles.statsSection}>
              <Card style={styles.statCard} mode="outlined">
                <Card.Content style={styles.statContent}>
                  <Icon source="package-variant-closed" size={32} color={theme.colors.primary} />
                  <Text style={styles.statValue}>{profile.product_count}</Text>
                  <Text style={styles.statLabel}>Products</Text>
                </Card.Content>
              </Card>

              <Card style={styles.statCard} mode="outlined">
                <Card.Content style={styles.statContent}>
                  <Icon source="weight-kilogram" size={32} color={theme.colors.secondary} />
                  <Text style={styles.statValue}>{profile.total_weight_kg}</Text>
                  <Text style={styles.statLabel}>Total kg</Text>
                </Card.Content>
              </Card>

              <Card style={styles.statCard} mode="outlined">
                <Card.Content style={styles.statContent}>
                  <Icon source="image-multiple" size={32} color={theme.tokens.status.success} />
                  <Text style={styles.statValue}>{profile.image_count}</Text>
                  <Text style={styles.statLabel}>Photos</Text>
                </Card.Content>
              </Card>

              <Card style={styles.statCard} mode="outlined">
                <Card.Content style={styles.statContent}>
                  <Icon source="tag-outline" size={32} color={theme.tokens.status.warning} />
                  <Text style={styles.statValue} numberOfLines={1}>
                    {profile.top_category || 'None'}
                  </Text>
                  <Text style={styles.statLabel}>Top Category</Text>
                </Card.Content>
              </Card>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: 16,
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
      borderRadius: 60,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
      elevation: 4,
      ...(Platform.OS === 'web'
        ? { boxShadow: `0px 2px 8px ${alpha(theme.colors.shadow, 0.1)}` }
        : {
            shadowColor: theme.colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
          }),
    },
    avatarText: {
      fontSize: 48,
      fontWeight: 'bold',
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
  });
}
