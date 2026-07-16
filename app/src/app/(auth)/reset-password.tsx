import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Controller } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import { TextInput } from '@/components/base/TextInput';
import { useResetPassword } from '@/features/auth/usePasswordReset';
import { useSensitiveAuthToken } from '@/features/auth/useSensitiveAuthToken';
import { PASSWORD_MIN_LENGTH } from '@/services/api/validation/userSchema';
import { useAppTheme } from '@/theme';

export default function ResetPasswordScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = useSensitiveAuthToken(typeof tokenParam === 'string' ? tokenParam : undefined);
  const { control, fieldError, isValid, isSubmitting, success, error, submit } =
    useResetPassword(token);
  const [showPassword, setShowPassword] = useState(false);
  const toggleShowPassword = useCallback(() => setShowPassword((s) => !s), []);
  const goToLogin = useCallback(() => router.push('/login'), [router]);
  const renderPassword = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: { onChange: (text: string) => void; value: string };
    }) => (
      <View style={{ gap: 4 }}>
        <AppText variant="label">New password</AppText>
        <View style={{ justifyContent: 'center' }}>
          <TextInput
            testID="password-input"
            value={value}
            onChangeText={onChange}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password-new"
            textContentType="newPassword"
            editable={!isSubmitting}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            accessibilityLabel="New password"
            style={{
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 10,
              paddingRight: 40,
              borderColor: theme.colors.outline,
            }}
          />
          <Pressable
            onPress={toggleShowPassword}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            // 20px glyph + 12px hitSlop/side = 44px tap target (a11y floor).
            hitSlop={12}
            style={{ position: 'absolute', right: 12 }}
          >
            <Icon
              name={showPassword ? 'eye-off' : 'eye'}
              size="md"
              color={theme.colors.onSurfaceVariant}
            />
          </Pressable>
        </View>
      </View>
    ),
    [
      showPassword,
      isSubmitting,
      toggleShowPassword,
      theme.colors.outline,
      theme.colors.onSurfaceVariant,
    ],
  );
  const renderConfirmPassword = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: { onChange: (text: string) => void; value: string };
    }) => (
      <View style={{ gap: 4 }}>
        <AppText variant="label">Confirm new password</AppText>
        <TextInput
          testID="confirm-password-input"
          value={value}
          onChangeText={onChange}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          editable={!isSubmitting}
          placeholder="Re-enter the password"
          accessibilityLabel="Confirm new password"
          style={{
            borderWidth: 1,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderColor: theme.colors.outline,
          }}
        />
      </View>
    ),
    [showPassword, isSubmitting, theme.colors.outline],
  );

  return (
    <AuthScreen>
      <Card>
        <View style={{ padding: 16, gap: 16 }}>
          <AppText variant="display">Reset password</AppText>

          {success ? (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
              <AppText variant="body" style={{ textAlign: 'center' }}>
                Password reset. You can now sign in.
              </AppText>
              <AppText variant="body">Redirecting to login…</AppText>
            </View>
          ) : (
            <>
              <Controller control={control} name="password" render={renderPassword} />

              <Controller control={control} name="confirmPassword" render={renderConfirmPassword} />

              {error || fieldError ? (
                <AppText style={{ color: theme.tokens.status.danger }}>
                  {error ?? fieldError}
                </AppText>
              ) : null}

              <AppButton
                variant="primary"
                onPress={submit}
                loading={isSubmitting}
                disabled={isSubmitting || !isValid}
              >
                Reset password
              </AppButton>

              <View
                style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}
              >
                <AppButton variant="ghost" onPress={goToLogin}>
                  Back to login
                </AppButton>
              </View>
            </>
          )}
        </View>
      </Card>
    </AuthScreen>
  );
}
