import { type RefObject, useCallback } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { palette } from '@/theme/palette.generated';
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
  const rpiCardStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.emptyActionCard,
      { opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1 },
      pressed && { opacity: 0.85 },
    ],
    [styles, isCapturing, rpiCamerasLoading],
  );
  return (
    <View testID="empty-gallery-actions" className="min-h-28 flex-row items-stretch gap-2">
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
          className="min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-dashed px-1 py-3"
          style={rpiCardStyle}
        >
          {isCapturing || rpiCamerasLoading ? (
            <ActivityIndicator size={32} />
          ) : (
            <Icon name="camera" size={24} color={palette[theme.scheme].mutedForeground} />
          )}
          <AppText variant="caption" className="text-center text-muted-foreground">
            {hasCamerasConfigured ? 'RPi Camera' : 'Connect camera'}
          </AppText>
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
  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.emptyActionCard, pressed && { opacity: 0.85 }],
    [styles],
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-dashed px-1 py-3"
      style={pressableStyle}
    >
      <Icon name={icon} size={24} color={palette[theme.scheme].mutedForeground} />
      <AppText variant="caption" className="text-center text-muted-foreground">
        {label}
      </AppText>
    </Pressable>
  );
}
