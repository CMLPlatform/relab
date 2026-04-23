import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { createCameraScreenStyles } from '@/components/cameras/screen/styles';
import { useAppTheme } from '@/theme';

export function CamerasLoadingState() {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

type CamerasErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function CamerasErrorState({ message, onRetry }: CamerasErrorStateProps) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);

  return (
    <View style={styles.center}>
      <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.error} />
      <Text style={styles.errorText}>{message}</Text>
      <Button mode="contained" onPress={onRetry} style={styles.retryButton}>
        Retry
      </Button>
    </View>
  );
}
