import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { AncestorTrailHeader } from '@/components/product/AncestorTrailHeader';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { renderWithProviders } from '@/test-utils/render';
import { getAppTheme } from '@/theme/themes';

jest.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: jest.fn(),
}));

const PARENT = { id: 2, name: 'HP ProBook 430 G2 Notebook PC', role: 'product' as const };

describe('AncestorTrailHeader', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  it('cuts crumbs to a short stub in the phone header', async () => {
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: false, isLg: false });
    await renderWithProviders(
      <AncestorTrailHeader
        ancestors={[PARENT]}
        currentNameSlot={<Text>Display assembly</Text>}
        theme={getAppTheme('light')}
      />,
    );
    expect(screen.getByText('HP ProBook 430 G2...')).toBeOnTheScreen();
  });

  // A deep component's full trail does not fit beside the back button on a
  // phone and pushes the current name out of the header.
  it('shows only the direct parent behind an ellipsis in a deep phone trail', async () => {
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: false, isLg: false });
    const root = { id: 1, name: 'iPhone 12', role: 'product' as const };
    const middle = { id: 13, name: 'Logic board assembly', role: 'component' as const };
    await renderWithProviders(
      <AncestorTrailHeader
        ancestors={[root, PARENT, middle]}
        currentNameSlot={<Text>Main logic board</Text>}
        theme={getAppTheme('light')}
      />,
    );
    expect(screen.getByRole('link', { name: `Go to ${middle.name}` })).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: `Go to ${root.name}` })).toBeNull();
    expect(
      screen.getByTestId('ancestor-trail-ellipsis', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('shows every ancestor in the lg page header', async () => {
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
    const root = { id: 1, name: 'iPhone 12', role: 'product' as const };
    await renderWithProviders(
      <AncestorTrailHeader
        ancestors={[root, PARENT]}
        currentNameSlot={<Text>Display assembly</Text>}
        theme={getAppTheme('light')}
      />,
    );
    expect(screen.getByRole('link', { name: `Go to ${root.name}` })).toBeOnTheScreen();
    expect(
      screen.queryByTestId('ancestor-trail-ellipsis', { includeHiddenElements: true }),
    ).toBeNull();
  });

  it('shows the full crumb name in the wide lg page header', async () => {
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
    await renderWithProviders(
      <AncestorTrailHeader
        ancestors={[PARENT]}
        currentNameSlot={<Text>Display assembly</Text>}
        theme={getAppTheme('light')}
      />,
    );
    expect(screen.getByText(PARENT.name)).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: `Go to ${PARENT.name}` })).toBeOnTheScreen();
  });
});
