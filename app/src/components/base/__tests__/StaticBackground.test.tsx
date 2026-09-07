import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StaticBackground } from '@/components/base/StaticBackground';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

describe('StaticBackground', () => {
  afterEach(restorePlatform);

  // The background is wrapped in an aria-hidden View (decorative — hidden from
  // screen readers and axe), so queries must opt into hidden elements.
  it('renders the background image on native platforms', () => {
    mockPlatform('ios');
    render(<StaticBackground />);
    expect(screen.getByTestId('expo-image-bg', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('renders the background image on web platform', () => {
    mockPlatform('web');
    render(<StaticBackground />);
    expect(screen.getByTestId('expo-image-bg', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
