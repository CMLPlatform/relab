import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { ActivityIndicator, Card, Text } from 'react-native-paper';
import { createLivePreviewStyles } from '@/components/cameras/live-preview/styles';
import { useAppTheme } from '@/theme';

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
      <Card.Content style={styles.content}>
        {children}
        <Text variant="bodySmall" style={styles.caption}>
          {caption}
        </Text>
      </Card.Content>
    </Card>
  );
}

export function PreviewLoadingOverlay() {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);
  return (
    <View style={styles.overlay}>
      <ActivityIndicator size={24} />
      <Text style={styles.overlayText}>Loading preview…</Text>
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
      <MaterialCommunityIcons name="video-off" size={32} color={theme.tokens.text.muted} />
      <Text style={styles.overlayText}>{message}</Text>
      <Pressable onPress={onRetry}>
        <Text style={styles.retryText}>Tap to retry</Text>
      </Pressable>
    </View>
  );
}
