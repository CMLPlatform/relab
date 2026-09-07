import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AuthBackToLoginAction, AuthCard, AuthFormError } from '@/components/auth/AuthCardSections';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { ControlledTextField } from '@/components/base/ControlledTextField';
import { Icon } from '@/components/base/Icon';
import { useResetPassword } from '@/features/auth/usePasswordReset';
import { useSensitiveAuthToken } from '@/features/auth/useSensitiveAuthToken';
import { PASSWORD_MIN_LENGTH } from '@/services/api/validation/userSchema';
import { useAppTheme } from '@/theme';

export default function ResetPasswordScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = useSensitiveAuthToken(typeof tokenParam === 'string' ? tokenParam : undefined);
  const { control, isValid, isSubmitting, success, error, submit } = useResetPassword(token);
  const [showPassword, setShowPassword] = useState(false);
  const toggleShowPassword = useCallback(() => setShowPassword((s) => !s), []);
  const goToLogin = useCallback(() => router.push('/login'), [router]);

  return (
    <AuthScreen>
      <AuthCard title="Reset password">
        {success ? (
          <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
            <AppText variant="body" style={{ textAlign: 'center' }}>
              Password reset. You can now sign in.
            </AppText>
            <AppText variant="body">Redirecting to login…</AppText>
          </View>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <AppText variant="label">New password</AppText>
              <View style={{ justifyContent: 'center' }}>
                <ControlledTextField
                  control={control}
                  name="password"
                  testID="password-input"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password-new"
                  textContentType="newPassword"
                  editable={!isSubmitting}
                  placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                  accessibilityLabel="New password"
                  style={{ paddingRight: 40 }}
                />
                <Pressable
                  onPress={toggleShowPassword}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  // 20px glyph + 12px hitSlop/side = 44px tap target (a11y floor).
                  hitSlop={12}
                  style={{ position: 'absolute', top: 10, right: 12 }}
                >
                  <Icon
                    name={showPassword ? 'eye-off' : 'eye'}
                    size="md"
                    color={theme.colors.onSurfaceVariant}
                  />
                </Pressable>
              </View>
            </View>

            <ControlledTextField
              control={control}
              name="confirmPassword"
              label="Confirm new password"
              testID="confirm-password-input"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              editable={!isSubmitting}
              placeholder="Re-enter the password"
              accessibilityLabel="Confirm new password"
            />

            <AuthFormError message={error} />

            <AppButton
              variant="primary"
              onPress={submit}
              loading={isSubmitting}
              disabled={isSubmitting || !isValid}
            >
              Reset password
            </AppButton>

            <AuthBackToLoginAction onPress={goToLogin} />
          </>
        )}
      </AuthCard>
    </AuthScreen>
  );
}
