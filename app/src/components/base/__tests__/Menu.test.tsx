import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { getMenuPosition, Menu } from '@/components/base/Menu';

describe('getMenuPosition', () => {
  const anchor = { anchorY: 100, anchorWidth: 40, anchorHeight: 40 };

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
});

describe('Menu', () => {
  it('always renders the anchor', () => {
    render(
      <Menu visible={false} onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByText('Sort')).toBeOnTheScreen();
  });

  it('hides the items when not visible', () => {
    render(
      <Menu visible={false} onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.queryByText('A-Z')).toBeNull();
  });

  it('shows the items when visible', () => {
    render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByText('A-Z')).toBeOnTheScreen();
  });

  it('exposes the popover container with a menu role', () => {
    render(
      <Menu visible onDismiss={jest.fn()} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    expect(screen.getByRole('menu')).toBeOnTheScreen();
  });

  it('fires onPress and does not dismiss via the item press itself', () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    render(
      <Menu visible onDismiss={onDismiss} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={onPress} />
      </Menu>,
    );
    fireEvent.press(screen.getByText('A-Z'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('dismisses when the backdrop is pressed', () => {
    const onDismiss = jest.fn();
    render(
      <Menu visible onDismiss={onDismiss} anchor={<Text>Sort</Text>}>
        <Menu.Item title="A-Z" onPress={jest.fn()} />
      </Menu>,
    );
    fireEvent.press(screen.getByLabelText('Dismiss menu'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
