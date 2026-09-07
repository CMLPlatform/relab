import { describe, expect, it } from '@jest/globals';
import { describedBy } from '@/utils/a11y';

describe('describedBy', () => {
  it('returns accessibilityDescribedBy pointing at the id when there is an error', () => {
    expect(describedBy('field-error', true)).toEqual({ accessibilityDescribedBy: 'field-error' });
  });

  it('returns no accessibility props when there is no error', () => {
    expect(describedBy('field-error', false)).toEqual({});
  });
});
