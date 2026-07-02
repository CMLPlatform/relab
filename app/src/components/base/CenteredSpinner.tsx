import { StyleSheet, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';

/** Full-height centered loading spinner for screen-level pending states. */
export function CenteredSpinner() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
