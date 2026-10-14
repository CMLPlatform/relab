import { StyleSheet } from 'react-native';
import { AppText } from '@/components/base/AppText';

const styles = StyleSheet.create({ title: { flexShrink: 1 } });

/**
 * A stack header title as plain text, for screens that render their own h1.
 * react-native-web turns react-navigation's default title (accessibilityRole
 * "header", no aria-level) into an <h1>, which would make two on the screen.
 */
export function PlainHeaderTitle({ children }: { children: string }) {
  return (
    <AppText variant="body" numberOfLines={1} className="font-bold" style={styles.title}>
      {children}
    </AppText>
  );
}
