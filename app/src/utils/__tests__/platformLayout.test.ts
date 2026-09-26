import { afterEach, describe, expect, it } from '@jest/globals';
import { mockPlatform, restorePlatform } from '@/test-utils/index';
import { getFloatingPosition } from '@/utils/platformLayout';

afterEach(() => {
  restorePlatform();
});

describe('getFloatingPosition', () => {
  // RN's type only admits 'absolute', but the web build needs CSS `fixed` so a
  // floating element stays put while the page scrolls.
  it('is fixed on web and absolute on native', () => {
    mockPlatform('web');
    expect(getFloatingPosition()).toBe('fixed');
    mockPlatform('android');
    expect(getFloatingPosition()).toBe('absolute');
  });
});
