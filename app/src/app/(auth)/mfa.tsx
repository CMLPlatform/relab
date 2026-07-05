import { View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useMfaScreen } from '@/features/auth/useMfaScreen';

export default function MfaScreen() {
  const { code, isSubmitting, canSubmit, tokenPresent, visibleError, handleCodeChange, submit } =
    useMfaScreen();

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20, gap: 16 }}>
      <Text variant="headlineMedium">Multi-factor authentication</Text>
      <TextInput
        mode="outlined"
        value={code}
        onChangeText={handleCodeChange}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        placeholder="6-digit code"
        maxLength={6}
        disabled={isSubmitting || !tokenPresent}
      />
      {visibleError ? (
        <HelperText type="error" visible>
          {visibleError}
        </HelperText>
      ) : null}
      <Button
        mode="contained"
        onPress={submit}
        loading={isSubmitting}
        disabled={isSubmitting || !canSubmit}
      >
        Continue
      </Button>
    </View>
  );
}
