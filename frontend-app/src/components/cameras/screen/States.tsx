import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { cameraScreenStyles as styles } from '@/components/cameras/screen/styles';

export function CamerasLoadingState() {
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
  const theme = useTheme();

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
