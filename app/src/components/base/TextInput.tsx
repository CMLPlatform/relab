import type React from 'react';
import { TextInput as NativeTextInput, type TextInputProps } from 'react-native';
import { useAppTheme } from '@/theme';

interface Props extends TextInputProps {
  errorOnEmpty?: boolean;
  customValidation?: (value: string) => boolean;
  ref?: React.Ref<NativeTextInput>;
}

export function TextInput({
  style,
  children,
  errorOnEmpty = false,
  customValidation,
  ref,
  ...props
}: Props) {
  const theme = useAppTheme();
  const emptyError = errorOnEmpty && (!props.value || props.value === '');
  const validationError = customValidation && props.value && !customValidation(props.value);
  const error = emptyError ? true : Boolean(validationError);

  return (
    <NativeTextInput
      ref={ref}
      style={[
        { color: theme.colors.onSurface },
        error && {
          backgroundColor: theme.colors.errorContainer,
          color: theme.colors.onErrorContainer,
        },
        style,
      ]}
      placeholderTextColor={theme.colors.onSurface}
      {...props}
    >
      {children}
    </NativeTextInput>
  );
}
