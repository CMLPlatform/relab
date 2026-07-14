import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText } from 'react-native';

jest.mock('@/components/product/capture/CaptureScreen', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as {
    Text: typeof RNText;
  };
  return {
    CaptureScreen: (props: { entityRole?: string; parentID?: number; parentRole?: string }) =>
      mockReact.createElement(
        Text,
        null,
        `role:${props.entityRole ?? ''} parent:${props.parentID ?? ''} parentRole:${props.parentRole ?? ''}`,
      ),
  };
});

import ProductNewPage from '@/app/products/new';

describe('ProductNewPage route', () => {
  it('renders CaptureScreen for a new product with no parent context', () => {
    render(<ProductNewPage />);
    expect(screen.getByText('role:product parent: parentRole:')).toBeOnTheScreen();
  });
});
