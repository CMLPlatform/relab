import type { RefObject } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { createGalleryStyles } from './styles';

type Props = {
  showCameraOption: boolean;
  showRpiButton: boolean;
  hasCamerasConfigured: boolean;
  isCapturing: boolean;
  rpiCamerasLoading: boolean;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onRpiCapture: () => void;
  rpiTriggerRef?: RefObject<View | null>;
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
  rpiTriggerRef,
}: Props) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <View className="h-[300px] flex-row gap-3">
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
        label="Add photos"
        accessibilityLabel="Add photos from gallery"
        icon="image-plus"
      />

      {showRpiButton ? (
        <Pressable
          ref={rpiTriggerRef}
          onPress={onRpiCapture}
          disabled={isCapturing || rpiCamerasLoading}
          accessibilityRole="button"
          accessibilityLabel={
            hasCamerasConfigured ? 'Capture from RPi camera' : 'Set up RPi camera'
          }
          className="flex-1 items-center justify-center rounded-lg border-2 border-dashed"
          style={[styles.emptyActionCard, { opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1 }]}
        >
          {isCapturing || rpiCamerasLoading ? (
            <ActivityIndicator size={32} />
          ) : (
            <Icon name="camera" size={48} color={theme.tokens.text.muted} />
          )}
          <Text className="mt-2" style={styles.emptyActionText}>
            {hasCamerasConfigured ? 'RPi Camera' : 'Connect camera'}
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
  icon: IconName;
}) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="flex-1 items-center justify-center rounded-lg border-2 border-dashed"
      style={styles.emptyActionCard}
    >
      <Icon name={icon} size={48} color={theme.tokens.text.muted} />
      <Text className="mt-2" style={styles.emptyActionText}>
        {label}
      </Text>
    </Pressable>
  );
}
