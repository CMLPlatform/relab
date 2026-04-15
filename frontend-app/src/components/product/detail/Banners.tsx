import { Pressable, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

export function ProductActiveStreamBanner({
  productName,
  onPress,
}: {
  productName: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.streamBanner} accessibilityRole="button">
      <View style={styles.streamDot} />
      <Text variant="bodySmall" style={{ flex: 1, color: '#e53935' }}>
        Live: {productName}
      </Text>
      <Icon source="chevron-right" size={14} color="#e53935" />
    </Pressable>
  );
}

export function ProductYouTubeSetupBanner({
  isGoogleLinked,
  onPress,
  surfaceVariant,
  onSurfaceVariant,
}: {
  isGoogleLinked: boolean;
  onPress: () => void;
  surfaceVariant: string;
  onSurfaceVariant: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.youtubeBanner, { backgroundColor: surfaceVariant }]}
      accessibilityRole="button"
      accessibilityLabel="Set up YouTube Live"
    >
      <Icon source="youtube" size={16} color={onSurfaceVariant} />
      <Text variant="bodySmall" style={{ flex: 1, color: onSurfaceVariant }}>
        {isGoogleLinked
          ? 'Enable YouTube Live in Integrations to stream this product'
          : 'Link your Google account to stream this product live'}
      </Text>
      <Icon source="chevron-right" size={16} color={onSurfaceVariant} />
    </Pressable>
  );
}

const styles = {
  streamBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(229,57,53,0.08)',
  },
  streamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53935',
  },
  youtubeBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    opacity: 0.7,
  },
};
