import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from '../Text';

describe('Text Component', () => {
  it('should render text content correctly', () => {
    const { getByText } = render(<Text>Hello World</Text>);
    expect(getByText('Hello World')).toBeTruthy();
  });

  it('should apply custom styles', () => {
    const customStyle = { fontSize: 20, fontWeight: 'bold' as const };
    const { getByText } = render(<Text style={customStyle}>Styled Text</Text>);
    expect(getByText('Styled Text')).toBeTruthy();
  });

  it('should pass through additional props', () => {
    const { getByText } = render(
      <Text numberOfLines={1} ellipsizeMode="tail">
        Long Text
      </Text>
    );
    expect(getByText('Long Text')).toBeTruthy();
  });

  it('should render children correctly', () => {
    const { getByText } = render(
      <Text>
        <Text>Nested Text</Text>
      </Text>
    );
    expect(getByText('Nested Text')).toBeTruthy();
  });
});
