import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Menu } from '@/components/base/Menu';

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
