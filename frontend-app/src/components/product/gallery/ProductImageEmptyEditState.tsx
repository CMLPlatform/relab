import { Pressable, Text, View } from 'react-native';
import { ActivityIndicator, Icon } from 'react-native-paper';
import { galleryStyles } from '@/components/product/gallery/styles';

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
  return (
    <View style={galleryStyles.emptyStateRow}>
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
          style={[
            galleryStyles.emptyActionCard,
            { opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1 },
          ]}
        >
          {isCapturing || rpiCamerasLoading ? (
            <ActivityIndicator size={32} />
          ) : (
            <Icon source="camera-wireless" size={48} color="#999" />
          )}
          <Text style={galleryStyles.emptyActionText}>
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={galleryStyles.emptyActionCard}
    >
      <Icon source={icon} size={48} color="#999" />
      <Text style={galleryStyles.emptyActionText}>{label}</Text>
    </Pressable>
  );
}
