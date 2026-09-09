import { Platform, StyleSheet, Text } from 'react-native';
import { heading } from '@/utils/a11y';

const styles = StyleSheet.create({
  // The classic clip: still in the accessibility tree (display:none and
  // visibility:hidden are not), and at its natural position, so focusing it
  // never scrolls the page sideways the way an off-canvas offset would.
  clipped: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
});

/**
 * The screen's `h1` for screens whose title lives only in the chrome (tab bar,
 * stack header) and so have none in the page. Web only: it gives the document
 * one heading and `useScreenEntryFocus` a title to land on; native chrome
 * already announces the screen. Render it inside `PageContainer`.
 */
export function ScreenTitle({ children }: { children: string }) {
  if (Platform.OS !== 'web') return null;
  return (
    <Text {...heading(1)} style={styles.clipped}>
      {children}
    </Text>
  );
}
