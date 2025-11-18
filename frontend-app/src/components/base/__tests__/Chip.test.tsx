import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Chip } from '../Chip';

describe('Chip Component', () => {
  it('should render children text correctly', () => {
    const { getByText } = render(<Chip>Test Chip</Chip>);
    expect(getByText('Test Chip')).toBeTruthy();
  });

  it('should render title when provided', () => {
    const { getByText } = render(<Chip title="Title">Content</Chip>);
    expect(getByText('Title')).toBeTruthy();
    expect(getByText('Content')).toBeTruthy();
  });

  it('should call onPress when pressed', () => {
    const onPressMock = jest.fn();
    const { getByText } = render(<Chip onPress={onPressMock}>Pressable Chip</Chip>);

    fireEvent.press(getByText('Pressable Chip'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('should render with error styles when error prop is true', () => {
    const { getByText } = render(<Chip error>Error Chip</Chip>);
    expect(getByText('Error Chip')).toBeTruthy();
  });

  it('should render with icon', () => {
    const { getByText } = render(<Chip icon={<>Icon</>}>Chip with Icon</Chip>);
    expect(getByText(/Chip with Icon/)).toBeTruthy();
  });

  it('should be disabled when disabled prop is true', () => {
    const onPressMock = jest.fn();
    const { getByText } = render(
      <Chip onPress={onPressMock} disabled>
        Disabled Chip
      </Chip>
    );

    fireEvent.press(getByText('Disabled Chip'));
    expect(onPressMock).not.toHaveBeenCalled();
  });
});
