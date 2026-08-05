import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';

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
      <View className="p-4 gap-4" style={contentStyle}>
        <View className="gap-1.5">
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
  if (!message) return null;
  return <AppText className="text-destructive">{message}</AppText>;
}

/** The centered "Back to login" ghost action row repeated across the auth forms. */
export function AuthBackToLoginAction({ onPress }: { onPress: () => void }) {
  return (
    <View className="flex-row gap-4 justify-center mt-2">
      <AppButton variant="ghost" onPress={onPress}>
        Back to login
      </AppButton>
    </View>
  );
}
