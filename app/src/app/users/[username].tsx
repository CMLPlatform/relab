import { Stack } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Card, Icon } from 'react-native-paper';

import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { Text } from '@/components/base/Text';
import { usePublicProfileScreen } from '@/features/profile/usePublicProfileScreen';
import { type AppTheme, alpha, memoizeByTheme, useAppTheme } from '@/theme';

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
            <Icon source="account-cancel-outline" size={48} color={theme.colors.error} />
            <Text style={{ ...styles.errorText, color: theme.colors.error }}>{errorMessage}</Text>
          </View>
        ) : null}

        {!(loading || hasError) && profile ? (
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
              {profile.created_at ? (
                <Text style={styles.joinedText}>
                  Joined{' '}
                  {new Date(profile.created_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              ) : null}
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
        ) : null}
      </ScrollView>
    </>
  );
}

const createStyles = memoizeByTheme((theme: AppTheme) =>
  StyleSheet.create({
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
  }),
);
