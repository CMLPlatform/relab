import { describe, expect, it } from '@jest/globals';
import { describedBy, heading } from '@/utils/a11y';

describe('describedBy', () => {
  it('returns accessibilityDescribedBy pointing at the id when there is an error', () => {
    expect(describedBy('field-error', true)).toEqual({ accessibilityDescribedBy: 'field-error' });
  });

  it('returns no accessibility props when there is no error', () => {
    expect(describedBy('field-error', false)).toEqual({});
  });
});

describe('heading', () => {
  // react-native-web picks the element from aria-level; without it every
  // header role renders as an <h1>, which is what useScreenEntryFocus hunts for.
  it('carries the header role and the level', () => {
    expect(heading(1)).toEqual({ accessibilityRole: 'header', 'aria-level': 1 });
    expect(heading(3)).toEqual({ accessibilityRole: 'header', 'aria-level': 3 });
  });
});
