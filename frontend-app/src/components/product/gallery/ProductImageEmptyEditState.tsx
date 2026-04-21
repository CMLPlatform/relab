import { Pressable, Text, View } from 'react-native';
import { ActivityIndicator, Icon } from 'react-native-paper';
import { createGalleryStyles } from '@/components/product/gallery/styles';
import { useAppTheme } from '@/theme';

type Props = {
  showCameraOption: boolean;
  showRpiButton: boolean;
  hasCamerasConfigured: boolean;
  isCapturing: boolean;
  rpiCamerasLoading: boolean;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onRpiCapture: () => void;
};

export function ProductImageEmptyEditState({
  showCameraOption,
  showRpiButton,
  hasCamerasConfigured,
  isCapturing,
  rpiCamerasLoading,
  onTakePhoto,
  onPickImage,
  onRpiCapture,
}: Props) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <View style={styles.emptyStateRow}>
      {showCameraOption ? (
        <EmptyActionCard
          onPress={onTakePhoto}
          label="Camera"
          accessibilityLabel="Take photo with camera"
          icon="camera"
        />
      ) : null}

      <EmptyActionCard
        onPress={onPickImage}
        label="Add Photos"
        accessibilityLabel="Add photos from gallery"
        icon="image-plus"
      />

      {showRpiButton ? (
        <Pressable
          onPress={onRpiCapture}
          disabled={isCapturing || rpiCamerasLoading}
          accessibilityRole="button"
          accessibilityLabel={
            hasCamerasConfigured ? 'Capture from RPi camera' : 'Set up RPi camera'
          }
          style={[styles.emptyActionCard, { opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1 }]}
        >
          {isCapturing || rpiCamerasLoading ? (
            <ActivityIndicator size={32} />
          ) : (
            <Icon source="camera-wireless" size={48} color={theme.tokens.text.muted} />
          )}
          <Text style={styles.emptyActionText}>
            {hasCamerasConfigured ? 'RPi Camera' : 'Connect Camera'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyActionCard({
  onPress,
  label,
  accessibilityLabel,
  icon,
}: {
  onPress: () => void;
  label: string;
  accessibilityLabel: string;
  icon: string;
}) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.emptyActionCard}
    >
      <Icon source={icon} size={48} color={theme.tokens.text.muted} />
      <Text style={styles.emptyActionText}>{label}</Text>
    </Pressable>
  );
}
