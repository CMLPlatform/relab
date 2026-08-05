import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { useAppTheme } from '@/theme';

/**
 * Shared scaffold for the auth screens that are a single Card holding a
 * title and stacked content (forgot-password, reset-password, mfa, verify).
 * Screens only supply their title and children; a screen with different
 * spacing needs (verify's centered, taller layout) can pass `contentStyle`.
 */
export function AuthCard({
  title,
  subtitle,
  contentStyle,
  children,
}: {
  title: string;
  // A short line directly under the title (e.g. mfa's mode description),
  // grouped tighter than the rest of the card's content.
  subtitle?: ReactNode;
  contentStyle?: ViewStyle;
  children: ReactNode;
}) {
  return (
    <Card>
      <View style={[styles.content, contentStyle]}>
        <View style={styles.titleGroup}>
          <AppText variant="display">{title}</AppText>
          {subtitle}
        </View>
        {children}
      </View>
    </Card>
  );
}

/** The danger-colored inline error text repeated across the auth forms. */
export function AuthFormError({ message }: { message?: string | null }) {
  const theme = useAppTheme();
  if (!message) return null;
  return <AppText style={{ color: theme.tokens.status.danger }}>{message}</AppText>;
}

/** The centered "Back to login" ghost action row repeated across the auth forms. */
export function AuthBackToLoginAction({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.actions}>
      <AppButton variant="ghost" onPress={onPress}>
        Back to login
      </AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
  },
  titleGroup: {
    gap: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    marginTop: 8,
  },
});
