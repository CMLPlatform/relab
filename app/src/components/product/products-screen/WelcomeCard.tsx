import { Image } from 'expo-image';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { NewProductPill, ProfilePill } from './InlinePills';
import { productsScreenStyles as styles } from './shared';

type ProductsWelcomeCardProps = {
  isAuthenticated: boolean;
  visible: boolean | null;
  onDismiss: () => void;
  onSignIn: () => void;
  onGoToProfile: () => void;
};

export function ProductsWelcomeCard({
  isAuthenticated,
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
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-primary/12">
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
            <AppText variant="heading" className="font-bold">
              {isAuthenticated ? 'Verify your email to start creating' : 'Welcome to Relab'}
            </AppText>
          </View>
        </View>

        <View className="gap-0">
          {!isAuthenticated ? (
            <AppText style={styles.welcomeBodyText}>
              Browse products freely. Sign in when you are ready to add your own.
            </AppText>
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
          ) : (
            <AppButton variant="tonal" onPress={onGoToProfile}>
              <Icon name="mail-check" size={18} color={theme.colors.primary} />
              <AppText>Verify email</AppText>
            </AppButton>
          )}
          <AppButton variant="ghost" onPress={onDismiss}>
            {isAuthenticated ? 'Got it' : 'Maybe later'}
          </AppButton>
        </View>
      </View>
    </Card>
  );
}
