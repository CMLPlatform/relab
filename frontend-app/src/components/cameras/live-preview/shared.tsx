import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { ActivityIndicator, Card, Text } from 'react-native-paper';
import { livePreviewStyles } from '@/components/cameras/live-preview/styles';

export function PreviewShell({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
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
  return (
    <View style={styles.overlay}>
      <MaterialCommunityIcons name="video-off" size={32} color="#999" />
      <Text style={styles.overlayText}>{message}</Text>
      <Pressable onPress={onRetry}>
        <Text style={styles.retryText}>Tap to retry</Text>
      </Pressable>
    </View>
  );
}

const styles = livePreviewStyles;
