import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { useAppTheme } from '@/theme';
import { NewProductPill, ProfilePill } from './InlinePills';
import { productsScreenStyles as styles } from './shared';

type CurrentUser = {
  isVerified?: boolean;
};

type ProductsWelcomeCardProps = {
  isAuthenticated: boolean;
  currentUser?: CurrentUser | null;
  visible: boolean | null;
  onDismiss: () => void;
  onSignIn: () => void;
  onGoToProfile: () => void;
};

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
    <Card style={[styles.welcomeCard, { backgroundColor: theme.colors.surfaceVariant }]}>
      <View style={styles.welcomeCardContent}>
        <View style={styles.welcomeHeaderRow}>
          <View style={[styles.welcomeIcon, { backgroundColor: theme.colors.primaryContainer }]}>
            <Image
              source={
                theme.dark
                  ? require('@/assets/images/mark-dark.png')
                  : require('@/assets/images/mark.png')
              }
              style={styles.welcomeBrandMark}
              contentFit="contain"
              accessibilityLabel=""
            />
          </View>
          <View style={styles.welcomeTextBlock}>
            <AppText style={styles.welcomeTitle}>
              {!isAuthenticated
                ? 'Welcome to Relab'
                : currentUser?.isVerified
                  ? 'Ready to add products'
                  : 'Verify your email to start creating'}
            </AppText>
          </View>
        </View>

        <View style={styles.welcomeBody}>
          {!isAuthenticated ? (
            <AppText style={styles.welcomeBodyText}>
              Browse products freely. Sign in when you are ready to add your own.
            </AppText>
          ) : currentUser?.isVerified ? (
            <View style={styles.welcomeSentence}>
              <AppText style={styles.welcomeBodyText}>Use the </AppText>
              <NewProductPill />
              <AppText style={styles.welcomeBodyText}>
                {' button to add products, and manage your '}
              </AppText>
              <ProfilePill />
              <AppText style={styles.welcomeBodyText}> anytime.</AppText>
            </View>
          ) : (
            <View style={styles.welcomeSentence}>
              <AppText style={styles.welcomeBodyText}>
                You can browse products and manage your
              </AppText>
              <ProfilePill />
              <AppText style={styles.welcomeBodyText}>
                . Once your email is verified, you can use the{' '}
              </AppText>
              <NewProductPill />
              <AppText style={styles.welcomeBodyText}> button to create products.</AppText>
            </View>
          )}
        </View>

        <View style={styles.welcomeActions}>
          {!isAuthenticated ? (
            <AppButton variant="tonal" onPress={onSignIn}>
              Sign in
            </AppButton>
          ) : !currentUser?.isVerified ? (
            <AppButton variant="tonal" onPress={onGoToProfile}>
              <MaterialCommunityIcons
                name="email-check-outline"
                size={18}
                color={theme.colors.primary}
              />
              <AppText>Verify email</AppText>
            </AppButton>
          ) : null}
          <AppButton variant="ghost" onPress={onDismiss}>
            {isAuthenticated ? 'Got it' : 'Maybe later'}
          </AppButton>
        </View>
      </View>
    </Card>
  );
}
