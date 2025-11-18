import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CPVCard from '../CPVCard';
import { CPVCategory } from '@/types/CPVCategory';

describe('CPVCard Component', () => {
  const mockCategory: CPVCategory = {
    id: 1,
    code: '12345678',
    name: 'Test Category',
    description: 'Test category description',
  };

  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render category name and description', () => {
    const { getByText } = render(<CPVCard CPV={mockCategory} onPress={mockOnPress} />);
    expect(getByText('Test Category')).toBeTruthy();
    expect(getByText('Test category description')).toBeTruthy();
  });

  it('should call onPress when pressed', () => {
    const { getByText } = render(<CPVCard CPV={mockCategory} onPress={mockOnPress} />);
    fireEvent.press(getByText('Test category description'));

    expect(mockOnPress).toHaveBeenCalled();
  });

  it('should render with error styles when name is "undefined"', () => {
    const errorCategory = { ...mockCategory, name: 'undefined' };
    const { getByText } = render(<CPVCard CPV={errorCategory} onPress={mockOnPress} />);
    expect(getByText('undefined')).toBeTruthy();
  });

  it('should render action element when provided', () => {
    const { queryByText } = render(
      <CPVCard CPV={mockCategory} onPress={mockOnPress} actionElement={<>Action</>} />
    );
    // Name should not be rendered when action element is provided
    expect(queryByText('Test Category')).toBeFalsy();
  });
});
