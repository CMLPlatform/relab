import type { TextInputProps } from 'react-native';

/**
 * Props to spread onto an input (alongside its other props) so assistive
 * tech associates it with the `FormFieldError` (see `components/base/FormField`)
 * sharing the same `id`. `accessibilityDescribedBy` isn't part of RN core's
 * `TextInputProps` — native platforms don't consume it — but react-native-web
 * forwards it to `aria-describedby`, which is what web screen readers and
 * axe-style checkers look for. The cast is scoped to this one helper.
 */
export function describedBy(id: string, hasError: boolean): Partial<TextInputProps> {
  return (hasError ? { accessibilityDescribedBy: id } : {}) as Partial<TextInputProps>;
}
