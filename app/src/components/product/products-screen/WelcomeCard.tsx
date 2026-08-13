import { Image } from 'expo-image';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
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
    <Card className="mx-0 rounded-lg bg-muted">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
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
          <View className="flex-1">
            <AppText className="font-bold" style={styles.welcomeTitle}>
              {!isAuthenticated
                ? 'Welcome to Relab'
                : currentUser?.isVerified
                  ? 'Ready to add products'
                  : 'Verify your email to start creating'}
            </AppText>
          </View>
        </View>

        <View className="gap-0">
          {!isAuthenticated ? (
            <AppText style={styles.welcomeBodyText}>
              Browse products freely. Sign in when you are ready to add your own.
            </AppText>
          ) : currentUser?.isVerified ? (
            <>
              <View className="flex-row flex-wrap items-center">
                <AppText style={styles.welcomeBodyText}>Use the </AppText>
                <NewProductPill />
                <AppText style={styles.welcomeBodyText}>
                  {' button to add products, and manage your '}
                </AppText>
                <ProfilePill />
                <AppText style={styles.welcomeBodyText}> anytime.</AppText>
              </View>
              <AppText className="mt-1" style={styles.welcomeBodyText}>
                Document a product, break it into components, and tag their materials — that's one
                full teardown.
              </AppText>
            </>
          ) : (
            <View className="flex-row flex-wrap items-center">
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

        <View className="flex-row flex-wrap justify-end gap-2">
          {!isAuthenticated ? (
            <AppButton variant="tonal" onPress={onSignIn}>
              Sign in
            </AppButton>
          ) : !currentUser?.isVerified ? (
            <AppButton variant="tonal" onPress={onGoToProfile}>
              <Icon name="mail-check" size={18} color={theme.colors.primary} />
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
