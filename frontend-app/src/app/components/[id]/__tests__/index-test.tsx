import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText } from 'react-native';

jest.mock('@/components/product/detail/ProductDetailScreen', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as {
    Text: typeof RNText;
  };
  return {
    ProductDetailScreen: () => mockReact.createElement(Text, null, 'DetailScreen'),
  };
});

import ComponentPage from '../index';

describe('ComponentPage route', () => {
  it('renders the shared product detail screen', () => {
    render(<ComponentPage />);
    expect(screen.getByText('DetailScreen')).toBeOnTheScreen();
  });
});
