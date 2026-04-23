import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { mockPlatform, restorePlatform } from '@/test-utils/index';
import { AnimatedBackground } from '../AnimatedBackground';

describe('AnimatedBackground', () => {
  afterEach(restorePlatform);

  it('renders correctly on native platforms', () => {
    mockPlatform('ios');
    render(<AnimatedBackground />);
    expect(screen.toJSON()).toBeTruthy();
  });

  it('renders correctly on web platform', () => {
    mockPlatform('web');
    render(<AnimatedBackground />);
    expect(screen.getByTestId('expo-image-bg')).toBeOnTheScreen();
  });
});
