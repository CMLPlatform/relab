import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StaticBackground } from '@/components/base/StaticBackground';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

describe('StaticBackground', () => {
  afterEach(restorePlatform);

  // The background is wrapped in an aria-hidden View (decorative, hidden from
  // screen readers and axe), so queries must opt into hidden elements.
  it('renders the background image on native platforms', async () => {
    mockPlatform('ios');
    await render(<StaticBackground />);
    expect(screen.getByTestId('expo-image-bg', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('renders the background image on web platform', async () => {
    mockPlatform('web');
    await render(<StaticBackground />);
    expect(screen.getByTestId('expo-image-bg', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('paints the scrim over the photo when one is given', async () => {
    const { toJSON } = await render(<StaticBackground scrim="rgba(1,2,3,0.5)" />);
    expect(JSON.stringify(toJSON())).toContain('rgba(1,2,3,0.5)');
  });

  it('paints no scrim by default', async () => {
    const { toJSON } = await render(<StaticBackground />);
    expect(JSON.stringify(toJSON())).not.toContain('backgroundColor');
  });
});
