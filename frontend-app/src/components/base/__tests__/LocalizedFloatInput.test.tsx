import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LocalizedFloatInput from '../LocalizedFloatInput';

describe('LocalizedFloatInput Component', () => {
  it('should render correctly', () => {
    const { getByDisplayValue } = render(
      <LocalizedFloatInput value={123.45} onChange={jest.fn()} />
    );
    expect(getByDisplayValue('123.45')).toBeTruthy();
  });

  it('should call onChange when blur occurs with valid value', () => {
    const onChangeMock = jest.fn();
    const { getByDisplayValue } = render(
      <LocalizedFloatInput value={100} onChange={onChangeMock} />
    );

    const input = getByDisplayValue('100');
    fireEvent.changeText(input, '250.5');
    fireEvent(input, 'blur');

    expect(onChangeMock).toHaveBeenCalledWith(250.5);
  });

  it('should handle empty input on blur', () => {
    const onChangeMock = jest.fn();
    const { getByDisplayValue } = render(
      <LocalizedFloatInput value={100} onChange={onChangeMock} />
    );

    const input = getByDisplayValue('100');
    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');

    expect(onChangeMock).toHaveBeenCalledWith(undefined);
  });

  it('should display zero correctly', () => {
    const { getByDisplayValue } = render(<LocalizedFloatInput value={0} onChange={jest.fn()} />);
    expect(getByDisplayValue('0')).toBeTruthy();
  });

  it('should pass through placeholder prop', () => {
    const { getByPlaceholderText } = render(
      <LocalizedFloatInput value={undefined} onChange={jest.fn()} placeholder="Enter weight" />
    );
    expect(getByPlaceholderText('Enter weight')).toBeTruthy();
  });

  it('should render with label when provided', () => {
    const { getByText } = render(
      <LocalizedFloatInput value={100} onChange={jest.fn()} label="Weight" />
    );
    expect(getByText('Weight')).toBeTruthy();
  });

  it('should render unit when provided', () => {
    const { getByText } = render(
      <LocalizedFloatInput value={100} onChange={jest.fn()} unit="kg" />
    );
    expect(getByText('kg')).toBeTruthy();
  });

  it('should not allow invalid input below minimum', () => {
    const onChangeMock = jest.fn();
    const { getByDisplayValue } = render(
      <LocalizedFloatInput value={100} onChange={onChangeMock} min={10} />
    );

    const input = getByDisplayValue('100');
    fireEvent.changeText(input, '5');
    fireEvent(input, 'blur');

    // Should not call onChange with value below min
    expect(onChangeMock).not.toHaveBeenCalled();
  });
});
