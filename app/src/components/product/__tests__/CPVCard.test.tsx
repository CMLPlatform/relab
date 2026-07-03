import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import CPVCard from '@/components/product/CPVCard';
import { renderWithProviders, setupUser } from '@/test-utils/index';
import { getAppTheme } from '@/theme';
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
  it('renders the CPV description', () => {
    renderWithProviders(<CPVCard CPV={mockCPV} />);
    expect(screen.getByText('Agricultural products')).toBeOnTheScreen();
  });

  it('renders CPV name as sub text', () => {
    renderWithProviders(<CPVCard CPV={mockCPV} />);
    expect(screen.getByText('03000000-1')).toBeOnTheScreen();
  });

  it("applies the error text color when CPV.name is 'undefined'", () => {
    const errorCPV = { ...mockCPV, name: 'undefined' };
    renderWithProviders(<CPVCard CPV={errorCPV} />);
    expect(screen.getByText('Agricultural products')).toHaveStyle({
      color: getAppTheme('light').colors.onErrorContainer,
    });
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    renderWithProviders(<CPVCard CPV={mockCPV} onPress={onPress} />);
    await user.press(screen.getByText('Agricultural products'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders actionElement instead of subText when provided', () => {
    renderWithProviders(<CPVCard CPV={mockCPV} actionElement={<Text>Custom Action</Text>} />);
    expect(screen.getByText('Custom Action')).toBeOnTheScreen();
    expect(screen.queryByText('03000000-1')).toBeNull();
  });
});
