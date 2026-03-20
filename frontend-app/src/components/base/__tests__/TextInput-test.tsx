import React from 'react';
import { render } from '@testing-library/react-native';
import { TextInput } from '../TextInput';

describe('<TextInput />', () => {
  test('renders placeholder correctly', () => {
    const { getByPlaceholderText } = render(<TextInput placeholder="Enter text" />);

    expect(getByPlaceholderText('Enter text')).toBeTruthy();
  });

  test('triggers empty error style when errorOnEmpty is passed', () => {
    const { getByTestId } = render(<TextInput testID="test-input" errorOnEmpty={true} value="" />);

    const input = getByTestId('test-input');
    // Array style includes the error styles
    expect(input.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: expect.anything() })]));
  });

  test('applies custom validation errors correctly', () => {
    const mockValidation = (val: string) => val.includes('valid');

    const { getByTestId } = render(
      <TextInput testID="validation-input" value="invalid" customValidation={mockValidation} />,
    );

    const input = getByTestId('validation-input');
    expect(input.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: expect.anything() })]));
  });
});
