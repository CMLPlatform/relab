import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import CPVCard, { CpvTypeLoadError } from '@/components/product/CPVCard';
import { mockPlatform, renderWithProviders, restorePlatform, setupUser } from '@/test-utils/index';
import type { CPVCategory } from '@/types/CPVCategory';

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: jest.fn(() => 'light'),
}));

const mockCPV: CPVCategory = {
  id: 1,
  name: '03000000-1',
  description: 'Agricultural products',
  allChildren: [],
  directChildren: [],
  updatedAt: '2024-01-01',
  createdAt: '2024-01-01',
};

describe('CPVCard', () => {
  const user = setupUser();
  it('renders the CPV description', async () => {
    await renderWithProviders(<CPVCard CPV={mockCPV} />);
    expect(screen.getByText('Agricultural products')).toBeOnTheScreen();
  });

  it('renders the CPV name as the heading, the description as a caption', async () => {
    await renderWithProviders(<CPVCard CPV={mockCPV} />);
    expect(screen.getByText('03000000-1')).toHaveStyle({ fontSize: 19 });
    expect(screen.getByText('Agricultural products')).toHaveStyle({ fontSize: 13 });
    // Not interactive without onPress: no button role.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<CPVCard CPV={mockCPV} onPress={onPress} />);
    await user.press(screen.getByText('Agricultural products'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders actionElement below the text when provided', async () => {
    await renderWithProviders(<CPVCard CPV={mockCPV} actionElement={<Text>Custom Action</Text>} />);
    expect(screen.getByText('Custom Action')).toBeOnTheScreen();
    expect(screen.getByText('03000000-1')).toBeOnTheScreen();
  });
});

describe('CpvTypeLoadError', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('states the failure in a status region and gives Retry a 44px floor', async () => {
    const retry = jest.fn();
    await renderWithProviders(<CpvTypeLoadError typeID={7} retry={retry} />);
    const message = screen.getByText("Category 7. Couldn't load its name.");
    const region = screen.getByTestId('cpv-load-error-status');
    expect(region.props.role).toBe('status');
    expect(region).toContainElement(message);
    const button = screen.getByRole('button', { name: 'Retry loading category name' });
    expect(button.props.className).toContain('min-h-11');
  });

  it('announces the failure on iOS, where live regions are ignored', async () => {
    mockPlatform('ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderWithProviders(<CpvTypeLoadError typeID={7} />);
    expect(announce).toHaveBeenCalledWith("Category 7. Couldn't load its name.");
    announce.mockRestore();
  });
});
