import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

/**
 * Shared auth frame: a centered, width-capped island lifted clear of the keyboard.
 * KeyboardAvoidingView is react-native-keyboard-controller's, not RN's built-in.
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <View className="w-full max-w-[420px]">{children}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
