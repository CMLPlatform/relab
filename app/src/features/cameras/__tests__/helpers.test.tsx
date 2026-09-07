import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { getCameraGridColumns, setCamerasHeaderOptions } from '@/features/cameras/helpers';

type Options = {
  title: string;
  headerLeft: (props: Record<string, unknown>) => ReactElement;
};

function applyHeader(overrides: Partial<Parameters<typeof setCamerasHeaderOptions>[0]> = {}) {
  const setOptions = jest.fn<(options: object) => void>();
  const navigate = jest.fn();
  setCamerasHeaderOptions({
    navigation: { setOptions },
    router: { navigate } as never,
    captureAllProductId: null,
    streamProductId: null,
    streamModeEnabled: false,
    ...overrides,
  });
  const options = setOptions.mock.calls[0][0] as Options;
  return { options, navigate };
}

async function pressBack(options: Options) {
  await render(options.headerLeft({}));
  await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
}

describe('setCamerasHeaderOptions — title', () => {
  it('names the stream picker while stream mode is on', () => {
    expect(applyHeader({ streamModeEnabled: true }).options.title).toBe('Select camera to stream');
  });

  it('falls back to the plain screen title', () => {
    expect(applyHeader().options.title).toBe('My cameras');
  });
});

// The cameras screen is reached from a product in two different flows, and the
// back affordance has to land on that product rather than the cameras tab root.
describe('setCamerasHeaderOptions — back target', () => {
  it('returns to the capture-all product', async () => {
    const { options, navigate } = applyHeader({ captureAllProductId: 12 });
    await pressBack(options);

    expect(navigate).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '12' },
    });
  });

  it('returns to the stream product when no capture-all flow is active', async () => {
    const { options, navigate } = applyHeader({ streamProductId: 7 });
    await pressBack(options);

    expect(navigate).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '7' },
    });
  });

  it('prefers the capture-all product when both flows are set', async () => {
    const { options, navigate } = applyHeader({ captureAllProductId: 12, streamProductId: 7 });
    await pressBack(options);

    expect(navigate).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '12' },
    });
  });

  it('falls back to the products list when neither flow is active', async () => {
    const { options, navigate } = applyHeader();
    await pressBack(options);

    expect(navigate).toHaveBeenCalledWith('/products');
  });

  // navigate(), not replace(): this crosses tabs, and replace would reset every
  // tab's trail.
  it('navigates rather than replacing, so the other tabs keep their history', async () => {
    const { options, navigate } = applyHeader({ captureAllProductId: 3 });
    await pressBack(options);

    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe('getCameraGridColumns', () => {
  it('widens the grid on desktop', () => {
    expect(getCameraGridColumns(true)).toBe(3);
    expect(getCameraGridColumns(false)).toBe(2);
  });
});
