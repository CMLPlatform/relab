import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { AnimatedBackground } from '../AnimatedBackground';

describe('AnimatedBackground', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('renders correctly on native platforms', () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });
    render(<AnimatedBackground />);
    // Animated.Image is mocked in jest.setup.ts to render a View (or similar)
    // We can check if it renders without crashing
    expect(screen.toJSON()).toBeTruthy();
  });

  it('renders correctly on web platform', () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'web',
      configurable: true,
    });
    render(<AnimatedBackground />);
    // ImageBackground is mocked in jest.setup.ts to render a View with testID 'expo-image-bg'
    expect(screen.getByTestId('expo-image-bg')).toBeTruthy();
  });

  it('applies animated style on native', () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });
    const { toJSON } = render(<AnimatedBackground />);
    const json = toJSON() as any;
    // The animated style should be applied to the transform
    // In our mock, useAnimatedStyle returns the style immediately
    expect(json.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transform: expect.arrayContaining([{ translateX: -0 }, { translateY: -0 }, { scale: 1.1 }]),
        }),
      ]),
    );
  });
});
