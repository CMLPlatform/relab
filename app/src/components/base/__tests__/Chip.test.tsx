import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { Chip } from '@/components/base/Chip';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { setupUser } from '@/test-utils/index';
import { renderWithProviders } from '@/test-utils/render';
import { getAppTheme } from '@/theme';

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: jest.fn(() => 'light'),
}));

// react-test-renderer's ReactTestInstance tree interleaves composite and host
// nodes with identical displayNames (RN's `View` forwardRef vs. the host
// primitive both read as "View"), so walking `.parent`/`.children` can't
// reliably tell "inside the Text node" from "next to it". `toJSON()` returns
// only the host tree, so sibling-ness there is unambiguous: find the
// `children` array that directly contains a node matching `matches`.
type JsonNode = { type: string; props?: Record<string, unknown>; children?: unknown[] | null };

function findContainingChildren(
  node: JsonNode | null,
  matches: (n: JsonNode) => boolean,
): unknown[] | null {
  const children = (node?.children ?? []) as unknown[];
  if (children.some((c) => typeof c === 'object' && c && matches(c as JsonNode))) {
    return children;
  }
  for (const child of children) {
    if (typeof child === 'object' && child) {
      const found = findContainingChildren(child as JsonNode, matches);
      if (found) return found;
    }
  }
  return null;
}

describe('Chip', () => {
  const user = setupUser();

  it('renders children text', () => {
    renderWithProviders(<Chip>My Label</Chip>);
    expect(screen.getByText('My Label')).toBeOnTheScreen();
  });

  it('renders title when provided', () => {
    renderWithProviders(<Chip title="Title Text">Content</Chip>);
    expect(screen.getByText('Title Text')).toBeOnTheScreen();
  });

  it('renders without title by default', () => {
    renderWithProviders(<Chip>No Title</Chip>);
    expect(screen.queryByText('Title Text')).toBeNull();
  });

  it('calls onPress handler when pressed', async () => {
    const onPress = jest.fn();
    renderWithProviders(<Chip onPress={onPress}>Press Me</Chip>);
    await user.press(screen.getByText('Press Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('applies error container style when error prop is set', () => {
    renderWithProviders(<Chip error>Error Chip</Chip>);
    // The icon-wrapping View, two composite levels above the Text's raw string node.
    expect(screen.getByText('Error Chip').parent?.parent?.parent).toHaveStyle({
      backgroundColor: getAppTheme('light').colors.errorContainer,
    });
    expect(screen.getByText('Error Chip')).toHaveStyle({
      color: getAppTheme('light').colors.onErrorContainer,
    });
  });

  it('applies primary style when error prop is not set', () => {
    renderWithProviders(<Chip>Normal Chip</Chip>);
    expect(screen.getByText('Normal Chip').parent?.parent?.parent).toHaveStyle({
      backgroundColor: getAppTheme('light').colors.primary,
    });
    expect(screen.getByText('Normal Chip')).toHaveStyle({
      color: getAppTheme('light').colors.onPrimary,
    });
  });

  it('applies dark mode styles when the system theme is dark', () => {
    jest.mocked(useEffectiveColorScheme).mockReturnValue('dark');

    renderWithProviders(<Chip>Dark Chip</Chip>);

    expect(screen.getByText('Dark Chip').parent?.parent?.parent).toHaveStyle({
      backgroundColor: getAppTheme('dark').colors.primary,
    });
    expect(screen.getByText('Dark Chip')).toHaveStyle({
      color: getAppTheme('dark').colors.onPrimary,
    });

    jest.mocked(useEffectiveColorScheme).mockReturnValue('light');
  });

  it('renders an icon when one is provided', () => {
    renderWithProviders(
      <Chip icon={<View testID="chip-icon" />} title="With Icon">
        Chip Content
      </Chip>,
    );

    expect(screen.getByTestId('chip-icon')).toBeOnTheScreen();
  });

  it('renders the icon as a sibling of the value text, not nested inside it', () => {
    const { toJSON } = renderWithProviders(
      <Chip icon={<View testID="chip-icon" />}>Chip Content</Chip>,
    );
    const json = toJSON() as unknown as JsonNode;

    const isIcon = (n: JsonNode) => n.props?.testID === 'chip-icon';
    const isValueText = (n: JsonNode) =>
      n.type === 'Text' && !!n.children?.includes('Chip Content');

    const iconSiblings = findContainingChildren(json, isIcon);
    // Same children array as the icon, and it contains the value Text too —
    // proves they're siblings in one flex row, not the icon nested inside
    // the Text (ProductCard's old `{children}{icon}` pattern).
    expect(iconSiblings).not.toBeNull();
    expect(
      iconSiblings?.some((c) => typeof c === 'object' && c && isValueText(c as JsonNode)),
    ).toBe(true);
  });

  it('renders no icon node when icon is false (ProductTags gates it on editMode)', () => {
    const { toJSON } = renderWithProviders(<Chip icon={false}>No Icon</Chip>);
    const json = toJSON() as unknown as JsonNode;

    expect(JSON.stringify(json)).not.toContain('chip-icon');
    // The value segment's children array holds only the Text — `false`
    // renders nothing, so no stray empty node sits where the icon would go.
    const isValueText = (n: JsonNode) => n.type === 'Text' && !!n.children?.includes('No Icon');
    const valueSiblings = findContainingChildren(json, isValueText);
    expect(valueSiblings).toHaveLength(1);
  });
});
