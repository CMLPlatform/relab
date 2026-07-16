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
    <Card style={styles.card}>
      <View style={styles.content}>
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
    <View style={styles.overlay}>
      <ActivityIndicator size={24} />
      <AppText style={styles.overlayText}>Loading preview…</AppText>
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
    <View style={styles.overlay}>
      <Icon name="video-off" size={32} color={theme.tokens.text.muted} />
      <AppText style={styles.overlayText}>{message}</AppText>
      <Pressable onPress={onRetry}>
        <AppText style={styles.retryText}>Tap to retry</AppText>
      </Pressable>
    </View>
  );
}
