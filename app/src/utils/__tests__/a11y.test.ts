import { describe, expect, it } from '@jest/globals';
import { mockPlatform, restorePlatform } from '@/test-utils';
import { describedBy, heading, requiredField } from '@/utils/a11y';

describe('describedBy', () => {
  it('returns accessibilityDescribedBy and aria-invalid when there is an error', () => {
    expect(describedBy('field-error', true)).toEqual({
      accessibilityDescribedBy: 'field-error',
      'aria-invalid': true,
    });
  });

  it('describes without marking invalid when asked to', () => {
    expect(describedBy('hint', true, { invalid: false })).toEqual({
      accessibilityDescribedBy: 'hint',
    });
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

describe('requiredField', () => {
  it('sets aria-required on web', () => {
    mockPlatform('web');
    expect(requiredField()).toEqual({ 'aria-required': true });
    restorePlatform();
  });

  it('falls back to a spoken hint on native, which has no required state', () => {
    mockPlatform('ios');
    expect(requiredField()).toEqual({ accessibilityHint: 'Required' });
    restorePlatform();
  });
});
