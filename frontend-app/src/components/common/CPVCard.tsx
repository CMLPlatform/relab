import { Icon } from 'react-native-paper';
import { Pressable, View, Text, StyleSheet, useColorScheme } from 'react-native';
import { CPVCategory } from '@/types/CPVCategory';
import LightTheme from '@/assets/themes/light';
import DarkTheme from '@/assets/themes/dark';

interface Props {
  CPV: CPVCategory;
  onPress?: () => void;
  actionElement?: React.ReactNode;
}

export default function CPVCard({ CPV, onPress, actionElement }: Props) {
  const darkMode = useColorScheme() === 'dark';
  const error = CPV.name === 'undefined';

  // Render
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        error ? styles.containerError : null,
        darkMode && !error ? styles.containerDark : null,
        darkMode && error ? styles.containerErrorDark : null,
        pressed && onPress && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          styles.text,
          error ? styles.textError : null,
          darkMode && !error ? styles.textDark : null,
          darkMode && error ? styles.textErrorDark : null,
        ]}
        numberOfLines={3}
        ellipsizeMode="tail"
      >
        {CPV.description}
      </Text>
      {actionElement || (
        <Text
          style={[
            styles.subText,
            error ? styles.subTextError : null,
            darkMode && !error ? styles.subTextDark : null,
            darkMode && error ? styles.subTextErrorDark : null,
          ]}
        >
          {CPV.name}
        </Text>
      )}
      <View style={styles.shapes}>
        <Icon source="shape" size={150} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 5,
    overflow: 'hidden',
    height: 100,
    justifyContent: 'space-between',
    backgroundColor: LightTheme.colors.primaryContainer,
  },
  containerDark: {
    backgroundColor: DarkTheme.colors.primaryContainer,
  },
  containerError: {
    backgroundColor: LightTheme.colors.errorContainer,
  },
  containerErrorDark: {
    backgroundColor: DarkTheme.colors.errorContainer,
  },

  text: {
    padding: 12,
    fontSize: 15,
    fontWeight: '500',
    color: LightTheme.colors.onPrimaryContainer,
  },
  textDark: {
    color: DarkTheme.colors.onPrimaryContainer,
  },
  textError: {
    color: LightTheme.colors.onErrorContainer,
  },
  textErrorDark: {
    color: DarkTheme.colors.onErrorContainer,
  },

  subText: {
    padding: 12,
    opacity: 0.7,
    textAlign: 'right',
    color: LightTheme.colors.onPrimaryContainer,
  },
  subTextDark: {
    color: DarkTheme.colors.onPrimaryContainer,
  },
  subTextError: {
    color: LightTheme.colors.onErrorContainer,
  },
  subTextErrorDark: {
    color: DarkTheme.colors.onErrorContainer,
  },

  shapes: {
    position: 'absolute',
    right: 10,
    top: -30,
    transform: [{ rotate: '-15deg' }],
    opacity: 0.1,
    zIndex: -1,
  },
});
