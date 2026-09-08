import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

/**
 * Shared auth frame: a centered, width-capped island lifted clear of the keyboard.
 * KeyboardAvoidingView is react-native-keyboard-controller's, not RN's built-in.
 *
 * The island scrolls once it is taller than the viewport (a zoomed browser, a
 * short phone with the keyboard up); centering alone left the bottom actions
 * unreachable.
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-[420px]">{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
