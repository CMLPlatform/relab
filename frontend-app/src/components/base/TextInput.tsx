import React from 'react';
import { TextInput as NativeTextInput, TextInputProps, StyleSheet, useColorScheme } from 'react-native';
import DarkTheme from '@/assets/themes/dark';
import LightTheme from '@/assets/themes/light';

interface Props extends TextInputProps {
  errorOnEmpty?: boolean;
  customValidation?: (value: string) => boolean;
  ref?: React.Ref<NativeTextInput>;
}

export function TextInput({ style, children, errorOnEmpty = false, customValidation, ref, ...props }: Props) {
  const darkMode = useColorScheme() === 'dark';
  const emptyError = errorOnEmpty && (!props.value || props.value === '');
  const validationError = customValidation && props.value && !customValidation(props.value);
  const error = emptyError || validationError;

  return (
    <NativeTextInput
      ref={ref}
      style={[
        styles.input,
        error ? styles.inputError : null,
        darkMode && !error ? styles.inputDark : null,
        darkMode && error ? styles.inputErrorDark : null,
        style,
      ]}
      placeholderTextColor={darkMode ? DarkTheme.colors.onSurface : LightTheme.colors.onSurface}
      {...props}
    >
      {children}
    </NativeTextInput>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: 'System',
    color: LightTheme.colors.onSurface,
  },
  inputDark: {
    color: DarkTheme.colors.onSurface,
  },
  inputError: {
    backgroundColor: LightTheme.colors.errorContainer,
    color: LightTheme.colors.onErrorContainer,
  },
  inputErrorDark: {
    backgroundColor: DarkTheme.colors.errorContainer,
    color: DarkTheme.colors.onErrorContainer,
  },
});
