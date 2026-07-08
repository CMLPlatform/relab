import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { AnimatedBackground } from '@/components/base/AnimatedBackground';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

describe('AnimatedBackground', () => {
  afterEach(restorePlatform);

  // The background is wrapped in an aria-hidden View (decorative — hidden from
  // screen readers and axe), so queries must opt into hidden elements.
  it('renders the background image on native platforms', () => {
    mockPlatform('ios');
    render(<AnimatedBackground />);
    expect(screen.getByTestId('expo-image-bg', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('renders the background image on web platform', () => {
    mockPlatform('web');
    render(<AnimatedBackground />);
    expect(screen.getByTestId('expo-image-bg', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
