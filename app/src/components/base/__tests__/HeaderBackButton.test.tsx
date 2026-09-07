import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { MIN_TAP_TARGET } from '@/constants';
import { getHostByType } from '@/test-utils/index';

async function renderButton(props: Partial<Parameters<typeof HeaderBackButton>[0]> = {}) {
  const onPress = jest.fn();
  await render(<HeaderBackButton onPress={onPress} {...(props as object)} />);
  return { onPress, button: screen.getByRole('button'), chevron: getHostByType('RNSVGSvgView') };
}

describe('HeaderBackButton', () => {
  it('fires the caller override, which may point somewhere other than the previous screen', async () => {
    const { onPress, button } = await renderButton();
    await fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('announces itself as "Go back" — the chevron alone has no accessible name', async () => {
    await renderButton();

    expect(screen.getByRole('button', { name: 'Go back' })).toBeOnTheScreen();
  });

  // hitSlop is invisible to the DOM on web, so the box itself has to carry the
  // tap-target floor.
  it('meets the minimum tap target in its own box, not only via hitSlop', async () => {
    const { button } = await renderButton();
    const style = StyleSheet.flatten(button.props.style);

    expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  });

  it('tints the chevron with the header tintColor when the navigator supplies one', async () => {
    const { chevron } = await renderButton({ tintColor: '#ff0000' });

    expect(chevron.props.stroke).toBe('#ff0000');
  });

  it('falls back to the theme foreground when the navigator supplies no tint', async () => {
    const { chevron } = await renderButton();

    expect(chevron.props.stroke).toEqual(expect.any(String));
    expect(chevron.props.stroke).not.toBe('#ff0000');
  });
});
