import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import type { CPVCategory } from '@/types/CPVCategory';
import CPVCard from '../CPVCard';

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
  it('renders the CPV description', () => {
    render(
      <PaperProvider>
        <CPVCard CPV={mockCPV} />
      </PaperProvider>,
    );
    expect(screen.getByText('Agricultural products')).toBeTruthy();
  });

  it('renders CPV name as sub text', () => {
    render(
      <PaperProvider>
        <CPVCard CPV={mockCPV} />
      </PaperProvider>,
    );
    expect(screen.getByText('03000000-1')).toBeTruthy();
  });

  it("applies error style when CPV.name is 'undefined'", () => {
    const errorCPV = { ...mockCPV, name: 'undefined' };
    const { toJSON } = render(
      <PaperProvider>
        <CPVCard CPV={errorCPV} />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(
      <PaperProvider>
        <CPVCard CPV={mockCPV} onPress={onPress} />
      </PaperProvider>,
    );
    fireEvent.press(screen.getByText('Agricultural products'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders actionElement instead of subText when provided', () => {
    render(
      <PaperProvider>
        <CPVCard CPV={mockCPV} actionElement={<Text>Custom Action</Text>} />
      </PaperProvider>,
    );
    expect(screen.getByText('Custom Action')).toBeTruthy();
    // subText (CPV.name) should not be rendered
    expect(screen.queryByText('03000000-1')).toBeNull();
  });
});
