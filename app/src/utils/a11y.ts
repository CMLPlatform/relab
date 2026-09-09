import type { TextInputProps, TextProps } from 'react-native';

/**
 * Props that associate an input with the `FormFieldError` sharing its `id`.
 * `accessibilityDescribedBy` is not in RN core's `TextInputProps`, but
 * react-native-web forwards it to `aria-describedby`.
 */
export function describedBy(id: string, hasError: boolean): Partial<TextInputProps> {
  return (hasError ? { accessibilityDescribedBy: id } : {}) as Partial<TextInputProps>;
}

/**
 * Props that render text as a heading at `level` (web: `<h1>`–`<h3>`).
 * `aria-level` is not in RN core's types; react-native-web reads it to pick
 * the element, and without it every `header` role becomes an `<h1>`.
 *
 * Level 1 is the screen's own title, and there is at most one per screen:
 * `useScreenEntryFocus` moves keyboard focus to it on entry. Sections and
 * dialog titles are level 2, headings inside them level 3.
 */
export function heading(level: 1 | 2 | 3): Partial<TextProps> {
  return { accessibilityRole: 'header', 'aria-level': level } as Partial<TextProps>;
}
