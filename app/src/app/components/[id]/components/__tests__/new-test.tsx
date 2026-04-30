import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText } from 'react-native';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '42' }),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/components/product/detail/ProductDetailScreen', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as {
    Text: typeof RNText;
  };
  return {
    ProductDetailScreen: (props: {
      formOptions?: {
        isNew?: boolean;
        initialEditMode?: boolean;
        draftSeed?: { parentID?: number; parentRole?: 'product' | 'component' };
      };
    }) => {
      const o = props.formOptions ?? {};
      const seed = o.draftSeed ?? {};
      return mockReact.createElement(
        Text,
        null,
        `new:${o.isNew ? 'y' : 'n'} edit:${o.initialEditMode ? 'y' : 'n'} parent:${seed.parentID ?? ''} parentRole:${seed.parentRole ?? ''}`,
      );
    },
  };
});

import NestedComponentNewPage from '../new';

describe('NestedComponentNewPage route', () => {
  it('renders ProductDetailScreen in new+edit mode and seeds component parent context', () => {
    render(<NestedComponentNewPage />);
    expect(screen.getByText('new:y edit:y parent:42 parentRole:component')).toBeOnTheScreen();
  });
});
