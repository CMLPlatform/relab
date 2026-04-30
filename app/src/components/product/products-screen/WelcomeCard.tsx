import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { useAppTheme } from '@/theme';
import { NewProductPill, ProfilePill } from './InlinePills';
import { productsScreenStyles as styles } from './shared';
import type { ProductsWelcomeCardProps } from './types';

export function ProductsWelcomeCard({
  isAuthenticated,
  currentUser,
  visible,
  onDismiss,
  onSignIn,
  onGoToProfile,
}: ProductsWelcomeCardProps) {
  const theme = useAppTheme();

  if (visible !== true) return null;

  return (
    <Card
      mode="contained"
      style={[styles.welcomeCard, { backgroundColor: theme.colors.surfaceVariant }]}
    >
      <Card.Content style={styles.welcomeCardContent}>
        <View style={styles.welcomeHeaderRow}>
          <View style={[styles.welcomeIcon, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons
              name="rocket-launch-outline"
              size={22}
              color={theme.colors.onPrimaryContainer}
            />
          </View>
          <View style={styles.welcomeTextBlock}>
            <Text style={styles.welcomeTitle}>
              {!isAuthenticated
                ? 'Welcome to RELab'
                : currentUser?.isVerified
                  ? 'Ready to add products'
                  : 'Verify your email to start creating'}
            </Text>
          </View>
        </View>

        <View style={styles.welcomeBody}>
          {!isAuthenticated ? (
            <Text style={styles.welcomeBodyText}>
              Browse products freely. Sign in when you are ready to add your own.
            </Text>
          ) : currentUser?.isVerified ? (
            <View style={styles.welcomeSentence}>
              <Text style={styles.welcomeBodyText}>Use the </Text>
              <NewProductPill />
              <Text style={styles.welcomeBodyText}> button to add products, and manage your </Text>
              <ProfilePill />
              <Text style={styles.welcomeBodyText}> anytime.</Text>
            </View>
          ) : (
            <View style={styles.welcomeSentence}>
              <Text style={styles.welcomeBodyText}>You can browse products and manage your</Text>
              <ProfilePill />
              <Text style={styles.welcomeBodyText}>
                . Once your email is verified, you can use the{' '}
              </Text>
              <NewProductPill />
              <Text style={styles.welcomeBodyText}> button to create products.</Text>
            </View>
          )}
        </View>

        <View style={styles.welcomeActions}>
          {!isAuthenticated ? (
            <Button mode="contained-tonal" onPress={onSignIn}>
              Sign in
            </Button>
          ) : !currentUser?.isVerified ? (
            <Button mode="contained-tonal" icon="email-check-outline" onPress={onGoToProfile}>
              Verify email
            </Button>
          ) : null}
          <Button mode="text" onPress={onDismiss}>
            {isAuthenticated ? 'Got it' : 'Maybe later'}
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
}
