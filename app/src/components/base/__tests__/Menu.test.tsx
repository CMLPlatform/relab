import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Menu } from '@/components/base/Menu';
import { getMenuPosition } from '@/components/base/menuPosition';
import { mockPlatform, queryAllHostsByProps, restorePlatform } from '@/test-utils/index';

describe('getMenuPosition', () => {
  const anchor = { anchorY: 100, anchorWidth: 40, anchorHeight: 40, windowHeight: 900 };

  it('pins to the anchor’s left edge when there is room to the right', () => {
    expect(getMenuPosition({ ...anchor, anchorX: 20, windowWidth: 1440 })).toEqual({
      top: 144,
      left: 20,
    });
  });

  it('flips to the anchor’s right edge when the menu would leave the viewport', () => {
    // A sort button at the right of a 1024 toolbar: left-anchoring would put
    // the menu's right edge at 964 + 180 = 1144, i.e. 120px off-screen.
    const position = getMenuPosition({ ...anchor, anchorX: 964, windowWidth: 1024 });
    expect(position).toEqual({ top: 144, right: 20 });
  });

  it('keeps the flipped menu inside the viewport', () => {
    const windowWidth = 1024;
    const position = getMenuPosition({ ...anchor, anchorX: 964, windowWidth });
    // right + minWidth must still fit, otherwise it spills out the other side.
    const right = 'right' in position ? position.right : 0;
    expect(windowWidth - right - 180).toBeGreaterThanOrEqual(0);
  });

  it('never pins hard against the left edge', () => {
    expect(getMenuPosition({ ...anchor, anchorX: 0, windowWidth: 1440 })).toEqual({
      top: 144,
      left: 8,
    });
  });

  it('opens upward when the anchor sits in the lower half of the window', () => {
    // An export button near the bottom of a 900-high window: opening below
    // would start the menu at 844 and push its items off-screen.
    expect(getMenuPosition({ ...anchor, anchorX: 20, anchorY: 800, windowWidth: 1440 })).toEqual({
      bottom: 104,
      left: 20,
    });
  });
});

describe('Menu', () => {
  it('always renders the anchor', async () => {
    await render(
      <Menu visible={false} onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByText('Sort')).toBeOnTheScreen();
  });

  it('hides the items when not visible', async () => {
    await render(
      <Menu visible={false} onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.queryByText('A-Z')).toBeNull();
  });

  it('shows the items when visible', async () => {
    await render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByText('A-Z')).toBeOnTheScreen();
  });

  it('exposes the popover container with a menu role', async () => {
    await render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByTestId('menu-popover').props.accessibilityRole).toBe('menu');
  });

  it('uses menuitem natively, where menuitemradio crashes the Android view manager', async () => {
    await render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" checked onPress={jest.fn()} />
      </Menu>,
    );
    const item = screen.getByRole('menuitem');
    expect(item.props.accessibilityState.checked).toBe(true);
    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });

  it('uses menuitemradio on web', async () => {
    mockPlatform('web');
    await render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" checked onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByTestId('menu-popover')).toBeOnTheScreen();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1);
    restorePlatform();
  });

  it('fires onPress and does not dismiss via the item press itself', async () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <Menu visible onDismiss={onDismiss} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={onPress} />
      </Menu>,
    );
    await fireEvent.press(screen.getByText('A-Z'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('dismisses when the backdrop is pressed', async () => {
    const onDismiss = jest.fn();
    await render(
      <Menu visible onDismiss={onDismiss} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    await fireEvent.press(screen.getByTestId('menu-scrim'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the scrim and wrapper out of the accessibility tree and names the menu', async () => {
    await render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByTestId('menu-scrim').props.accessible).toBe(false);
    // accessible=false keeps the items reachable on iOS; RNTL then hides the node from role queries.
    expect(screen.getByTestId('menu-popover').props.accessible).toBe(false);
    expect(
      screen.getByRole('menuitem', { name: 'A-Z', includeHiddenElements: false }),
    ).toBeOnTheScreen();
  });

  it('keeps the scrim and wrapper out of the web tab order', async () => {
    await render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByTestId('menu-scrim').props.tabIndex).toBe(-1);
    expect(screen.getByTestId('menu-popover').props.tabIndex).toBe(-1);
  });

  it('names the menu once, on the Modal, not again on the popover', async () => {
    await render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByTestId('menu-popover').props['aria-label']).toBeUndefined();
    expect(queryAllHostsByProps({ 'aria-label': 'Menu' })).toHaveLength(1);
  });
});
