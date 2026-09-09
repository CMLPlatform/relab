// NOTE: hand-rolled on purpose; carries error/validation state; no primitive in this app provides that + borderless default.
import type React from 'react';
import { TextInput as NativeTextInput, type TextInputProps } from 'react-native';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme';

interface Props extends TextInputProps {
  errorOnEmpty?: boolean;
  customValidation?: (value: string) => boolean;
  // Opt-in to the primitive's bordered look (1px outline, 12/10 padding).
  bordered?: boolean;
  ref?: React.Ref<NativeTextInput>;
}

export function TextInput({
  style,
  children,
  errorOnEmpty = false,
  customValidation,
  bordered = false,
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
        // The primitive owns the control radius; a caller style can override it.
        { color: theme.colors.onSurface, borderRadius: radius.control },
        bordered && {
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderColor: theme.colors.outline,
        },
        // Danger border only; the field-level caller renders the caption.
        error && {
          borderWidth: 1,
          borderColor: theme.tokens.status.danger,
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
