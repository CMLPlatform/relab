import type React from 'react';
import { TextInput as NativeTextInput, type TextInputProps } from 'react-native';
import { radius } from '@/constants';
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
        // The primitive owns the control radius so call sites don't hardcode one
        // (DESIGN.md form language); a caller style can still override it.
        { color: theme.colors.onSurface, borderRadius: radius.control },
        error && {
          backgroundColor: theme.colors.errorContainer,
          color: theme.colors.onErrorContainer,
        },
        style,
      ]}
      placeholderTextColor={theme.colors.onSurfaceVariant}
      {...props}
    >
      {children}
    </NativeTextInput>
  );
}
