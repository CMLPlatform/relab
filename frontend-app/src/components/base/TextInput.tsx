import React from 'react';
import { TextInput as NativeTextInput, TextInputProps, StyleSheet } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

interface Props extends TextInputProps {
  errorOnEmpty?: boolean;
  customValidation?: (value: string) => boolean;
  ref?: React.Ref<NativeTextInput>;
}

export function TextInput({ style, children, errorOnEmpty = false, customValidation, ref, ...props }: Props) {
  const { colors } = useAppTheme();
  const emptyError = errorOnEmpty && (!props.value || props.value === '');
  const validationError = customValidation && props.value && !customValidation(props.value);
  const error = emptyError || validationError;

  return (
    <NativeTextInput
      ref={ref}
      style={[
        styles.input,
        { color: colors.onSurface },
        error && { backgroundColor: colors.errorContainer, color: colors.onErrorContainer },
        style,
      ]}
      placeholderTextColor={colors.onSurface}
      {...props}
    >
      {children}
    </NativeTextInput>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: 'System',
  },
});
