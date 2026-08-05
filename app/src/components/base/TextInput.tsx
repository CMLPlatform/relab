// NOTE (2026-08-05): assessed against the vendored `ui/input` primitive and kept
// hand-rolled. `Input` is styling only — it has no error/validation state, no
// `errorContainer` color (that token exists in the theme, not in
// brand.generated.css), and it defaults to a bordered 44px control, the opposite
// of this component's borderless default. Wrapping it would mean class overrides
// to undo those defaults plus the same inline error styles, i.e. net-added code.
// `ui/input` stays the primitive for the search/capture fields that want its look.
import type React from 'react';
import { TextInput as NativeTextInput, type TextInputProps } from 'react-native';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme';

interface Props extends TextInputProps {
  errorOnEmpty?: boolean;
  customValidation?: (value: string) => boolean;
  // Opt-in to the primitive's default bordered look (1px outline, 12/10
  // padding) instead of every call site hand-copying that literal. Defaults
  // to false so existing borderless call sites (inline editable text etc.)
  // are unaffected.
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
        // The primitive owns the control radius so call sites don't hardcode one
        // (DESIGN.md form language); a caller style can still override it.
        { color: theme.colors.onSurface, borderRadius: radius.control },
        bordered && {
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderColor: theme.colors.outline,
        },
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
