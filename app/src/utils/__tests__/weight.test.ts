import { describe, expect, it } from '@jest/globals';
import { formatWeightKg } from '@/utils/weight';

describe('formatWeightKg', () => {
  it.each([
    [0, '0 g'],
    [0.164, '164 g'],
    [0.9994, '999 g'],
    [0.9996, '1.0 kg'],
    [1, '1.0 kg'],
    [1.55, '1.6 kg'],
    [35, '35.0 kg'],
  ])('formats %p kg as %p', (kg, expected) => {
    expect(formatWeightKg(kg)).toBe(expected);
  });
});
