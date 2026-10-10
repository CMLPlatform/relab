import { View } from 'react-native';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';

// noopener: the new tab must not get a handle back to the embedding page.
const openInNewTab = () => window.open(window.location.href, '_blank', 'noopener');

/** Stands in for the sign-in and sign-up forms when the app is framed (see isFramed). */
export function FramedAuthNotice() {
  return (
    <AuthScreen>
      <View className="items-center gap-3">
        <AppText className="text-center text-muted-foreground">
          R9lab is embedded in another page. Open it in its own tab to sign in or create an account.
        </AppText>
        <AppButton variant="primary" onPress={openInNewTab} className="mt-2">
          Open R9lab in a new tab
        </AppButton>
      </View>
    </AuthScreen>
  );
}
