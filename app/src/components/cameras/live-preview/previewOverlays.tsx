import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { palette } from '@/theme/palette.generated';
import { createLivePreviewStyles } from './styles';

export function PreviewShell({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    <Card className="mx-4 mt-3">
      <View className="items-center gap-2 p-4">
        {children}
        <AppText variant="body" className="text-muted-foreground">
          {caption}
        </AppText>
      </View>
    </Card>
  );
}

// hls.js can soft-retry forever without a fatal error, so the indeterminate
// spinner alone can't distinguish "connecting" from "stuck". After this long,
// the copy levels with the user. Static text swap — there is no real progress
// signal to animate.
const STALLED_AFTER_MS = 10_000;

export function PreviewLoadingOverlay() {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View className="absolute inset-0 items-center justify-center gap-2" style={styles.overlay}>
      <ActivityIndicator size={24} />
      <AppText className="text-center text-primary-foreground">
        {stalled ? "Still connecting — check the camera's network" : 'Loading preview…'}
      </AppText>
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
      <Icon name="video-off" size={32} color={palette[theme.scheme].mutedForeground} />
      <AppText className="text-center text-primary-foreground">{message}</AppText>
      <Pressable onPress={onRetry} accessibilityRole="button">
        <AppText className="mt-1 text-primary-foreground underline">Tap to retry</AppText>
      </Pressable>
    </View>
  );
}
