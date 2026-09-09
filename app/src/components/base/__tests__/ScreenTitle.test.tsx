import { afterEach, describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { ScreenTitle } from '@/components/base/ScreenTitle';
import { mockPlatform, renderWithProviders, restorePlatform } from '@/test-utils/index';

describe('ScreenTitle', () => {
  afterEach(() => {
    restorePlatform();
  });

  // The document's only h1, and what useScreenEntryFocus lands on.
  it('renders a level 1 heading on web', async () => {
    mockPlatform('web');
    await renderWithProviders(<ScreenTitle>Products</ScreenTitle>);

    const title = screen.getByText('Products');
    expect(title.props.accessibilityRole).toBe('header');
    expect(title.props['aria-level']).toBe(1);
  });

  // Native chrome announces the screen already; a clipped duplicate would
  // just be read twice.
  it('renders nothing on native', async () => {
    mockPlatform('ios');
    await renderWithProviders(<ScreenTitle>Products</ScreenTitle>);

    expect(screen.queryByText('Products')).toBeNull();
  });
});
