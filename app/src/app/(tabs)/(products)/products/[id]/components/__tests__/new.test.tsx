import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText } from 'react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '42' }),
}));

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

import ComponentNewPage from '@/app/(tabs)/(products)/products/[id]/components/new';

describe('ComponentNewPage route', () => {
  it('renders CaptureScreen for a new component and seeds parent id from the URL', () => {
    render(<ComponentNewPage />);
    expect(screen.getByText('role:component parent:42 parentRole:product')).toBeOnTheScreen();
  });
});
