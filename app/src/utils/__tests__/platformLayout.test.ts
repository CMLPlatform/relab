import { afterEach, describe, expect, it } from '@jest/globals';
import { mockPlatform, restorePlatform } from '@/test-utils/index';
import { getFloatingPosition, textGlow } from '@/utils/platformLayout';

afterEach(() => {
  restorePlatform();
});

describe('textGlow', () => {
  it('emits the CSS shorthand on web', () => {
    mockPlatform('web');
    expect(textGlow('#ff0000', 8)).toEqual({ textShadow: '0px 0px 8px #ff0000' });
  });

  it('emits the React Native shadow props on native', () => {
    mockPlatform('ios');
    expect(textGlow('#ff0000')).toEqual({
      textShadowColor: '#ff0000',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 5,
    });
  });
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
