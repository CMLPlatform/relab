import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { createLivePreviewStyles } from './styles';

export function PreviewShell({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);
  return (
    <Card className="mx-4 mt-3">
      <View className="items-center gap-2 p-4">
        {children}
        <AppText variant="body" style={styles.caption}>
          {caption}
        </AppText>
      </View>
    </Card>
  );
}

export function PreviewLoadingOverlay() {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);
  return (
    <View className="absolute inset-0 items-center justify-center gap-2" style={styles.overlay}>
      <ActivityIndicator size={24} />
      <AppText className="text-center text-primary-foreground">Loading preview…</AppText>
    </View>
  );
}

export function PreviewErrorOverlay({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);
  return (
    <View className="absolute inset-0 items-center justify-center gap-2" style={styles.overlay}>
      <Icon name="video-off" size={32} color={theme.tokens.text.muted} />
      <AppText className="text-center text-primary-foreground">{message}</AppText>
      <Pressable onPress={onRetry} accessibilityRole="button">
        <AppText className="mt-1 text-primary-foreground underline">Tap to retry</AppText>
      </Pressable>
    </View>
  );
}
