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

import NestedComponentNewPage from '@/app/components/[id]/components/new';

describe('NestedComponentNewPage route', () => {
  it('renders CaptureScreen for a new component and seeds the component-parent context', () => {
    render(<NestedComponentNewPage />);
    expect(screen.getByText('role:component parent:42 parentRole:component')).toBeOnTheScreen();
  });
});
