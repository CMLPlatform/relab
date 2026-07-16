import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

/**
 * The shared auth frame: a centered, width-capped island over the app backdrop,
 * lifted clear of the software keyboard. Every auth screen uses this shape —
 * screens only supply their own content and inner spacing.
 *
 * KeyboardAvoidingView comes from react-native-keyboard-controller (its
 * KeyboardProvider is already mounted in the root layout) rather than RN's
 * built-in, which needs per-platform `behavior` tuning to behave the same.
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <View style={styles.column}>{children}</View>
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
  column: {
    width: '100%',
    maxWidth: 420,
  },
});
