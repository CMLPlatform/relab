import { describe, expect, it } from 'vitest';

import { barPercent, formatCount, formatMass } from './stats.ts';

describe('formatCount', () => {
  it('groups thousands and rounds', () => {
    expect(formatCount(18300)).toBe('18,300');
    expect(formatCount(1240.6)).toBe('1,241');
  });
});

describe('formatMass', () => {
  it('stays in kilograms below a tonne', () => {
    expect(formatMass(940)).toEqual({ value: '940', unit: 'kg' });
  });

  it('switches to tonnes with one decimal, then drops decimals when large', () => {
    expect(formatMass(4200)).toEqual({ value: '4.2', unit: 't' });
    expect(formatMass(42000)).toEqual({ value: '42', unit: 't' });
  });
});

describe('barPercent', () => {
  it('floors the smallest bar so it stays visible and caps the largest', () => {
    expect(barPercent(320, 320)).toBe(100);
    expect(barPercent(0, 320)).toBe(12);
  });

  it('returns 0 when there is no data', () => {
    expect(barPercent(5, 0)).toBe(0);
  });
});
