import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Card, Text } from 'react-native-paper';

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

export const livePreviewStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  content: {
    alignItems: 'center',
    gap: 8,
  },
  videoFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  overlayText: {
    color: '#fff',
    textAlign: 'center',
  },
  caption: {
    color: '#999',
  },
  retryText: {
    color: '#fff',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});

const styles = livePreviewStyles;
