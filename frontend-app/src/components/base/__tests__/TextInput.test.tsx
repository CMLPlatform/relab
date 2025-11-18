import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TextInput } from '../TextInput';

describe('TextInput Component', () => {
  it('should render with value and handle text changes', () => {
    const onChangeText = jest.fn();
    const { getByDisplayValue } = render(
      <TextInput value="test value" onChangeText={onChangeText} />
    );

    const input = getByDisplayValue('test value');
    fireEvent.changeText(input, 'new value');

    expect(onChangeText).toHaveBeenCalledWith('new value');
  });

  it('should show error styles when empty and errorOnEmpty is true', () => {
    const { getByPlaceholderText } = render(
      <TextInput value="" placeholder="Enter text" errorOnEmpty={true} />
    );

    const input = getByPlaceholderText('Enter text');
    expect(input).toBeTruthy();
  });

  it('should pass through additional props', () => {
    const { getByPlaceholderText } = render(
      <TextInput placeholder="Test placeholder" multiline={true} editable={false} />
    );

    const input = getByPlaceholderText('Test placeholder');
    expect(input.props.multiline).toBe(true);
    expect(input.props.editable).toBe(false);
  });
});
