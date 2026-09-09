import { describe, expect, it } from '@jest/globals';
import { decimalSeparatorFor } from '@/utils/locale';

describe('decimalSeparatorFor', () => {
  it.each([
    ['de-DE@posix', ','],
    ['en-US@posix', '.'],
    ['de-DE', ','],
    ['en-US', '.'],
  ])('reads the separator from %s', (tag, expected) => {
    // A tag carrying an extension throws RangeError in Intl. Falling straight back to a
    // dot showed German users a decimal point in a field that only accepts their comma.
    expect(decimalSeparatorFor(tag)).toBe(expected);
  });
});
