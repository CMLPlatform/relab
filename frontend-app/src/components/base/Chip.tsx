import { StyleSheet, Pressable, PressableProps, useColorScheme } from 'react-native';
import React from 'react';
import LightTheme from '@/assets/themes/light';
import DarkTheme from '@/assets/themes/dark';

import { Text } from '@/components/base';

interface Props extends PressableProps {
  children?: string;
  title?: string;
  icon?: React.ReactNode;
  error?: boolean;
}

export const Chip: React.FC<Props> = ({ style, children, title, icon, error, ...props }) => {
  const darkMode = useColorScheme() === 'dark';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        error ? styles.containerError : null,
        darkMode && !error ? styles.containerDark : null,
        darkMode && error ? styles.containerErrorDark : null,
        pressed && { opacity: 0.5 },
      ]}
      {...props}
    >
      {title && <Text style={[styles.titleText, darkMode ? styles.titleTextDark : null]}>{title}</Text>}
      <Text
        style={[
          styles.text,
          error ? styles.textError : null,
          darkMode && !error ? styles.textDark : null,
          darkMode && error ? styles.textErrorDark : null,
        ]}
      >
        {children}
        {icon && '   '}
        {icon}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 5,
    flexDirection: 'row',
    backgroundColor: LightTheme.colors.primaryContainer,
  },
  containerDark: {
    backgroundColor: DarkTheme.colors.primaryContainer,
  },
  containerError: {
    backgroundColor: LightTheme.colors.surfaceVariant,
  },
  containerErrorDark: {
    backgroundColor: DarkTheme.colors.surfaceVariant,
  },

  text: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 15,
    backgroundColor: LightTheme.colors.primary,
    color: LightTheme.colors.onPrimary,
  },
  textDark: {
    backgroundColor: DarkTheme.colors.primary,
    color: DarkTheme.colors.onPrimary,
  },
  textError: {
    backgroundColor: LightTheme.colors.errorContainer,
    color: LightTheme.colors.onErrorContainer,
  },
  textErrorDark: {
    backgroundColor: DarkTheme.colors.errorContainer,
    color: DarkTheme.colors.onErrorContainer,
  },

  titleText: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 15,
    color: LightTheme.colors.onPrimaryContainer,
  },
  titleTextDark: {
    color: DarkTheme.colors.onPrimaryContainer,
  },
});
