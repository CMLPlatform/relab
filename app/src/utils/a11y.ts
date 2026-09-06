import type { TextInputProps } from 'react-native';

/**
 * Props that associate an input with the `FormFieldError` sharing its `id`.
 * `accessibilityDescribedBy` is not in RN core's `TextInputProps`, but
 * react-native-web forwards it to `aria-describedby`.
 */
export function describedBy(id: string, hasError: boolean): Partial<TextInputProps> {
  return (hasError ? { accessibilityDescribedBy: id } : {}) as Partial<TextInputProps>;
}
