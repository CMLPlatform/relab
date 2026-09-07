/**
 * Factories for the `jest.mock` module stubs that more than one suite needs.
 *
 * These run inside hoisted `jest.mock` factories, so they may only reach for
 * `jest.requireActual` — never a top-level import of `react` or `react-native`.
 * Call them from the factory body:
 *
 *     jest.mock('react-native-gesture-handler', () => mockGestureHandler());
 */

import type { ViewProps } from 'react-native';

type RenderItem = (info: { item: unknown; index: number }) => unknown;
type FlatListMockProps = {
  data?: unknown[];
  renderItem?: RenderItem;
  [key: string]: unknown;
};

/**
 * Stub for `react-native-gesture-handler`.
 *
 * `onRender`, when given, receives the props of every FlatList render so a suite
 * can assert on layout metrics it cannot observe through the rendered output. It
 * is a callback rather than an array because the factory runs before the suite's
 * own top-level consts initialise — only the render is late enough to see them.
 * `gestures` adds the `Gesture`/`GestureDetector` surface — the gesture builders
 * return their callbacks unwrapped so tests can invoke them directly.
 */
export function mockGestureHandler({
  onRender,
  gestures = false,
}: {
  onRender?: (props: FlatListMockProps) => void;
  gestures?: boolean;
} = {}) {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  const FlatListMock = React.forwardRef(function FlatListMock(
    { data, renderItem, ...props }: FlatListMockProps,
    ref: React.ForwardedRef<{ scrollToIndex: () => void; scrollToOffset: () => void }>,
  ) {
    onRender?.(props);
    React.useImperativeHandle(
      ref,
      () => ({ scrollToIndex: jest.fn(), scrollToOffset: jest.fn() }),
      [],
    );
    return React.createElement(
      View,
      props,
      Array.isArray(data) && renderItem
        ? data.map((item, index) =>
            React.createElement(
              React.Fragment,
              { key: index },
              renderItem({ item, index }) as React.ReactNode,
            ),
          )
        : null,
    );
  });
  FlatListMock.displayName = 'FlatListMock';

  if (!gestures) return { FlatList: FlatListMock };

  const passthrough = (cb: unknown) => cb;
  const tapChain = { onEnd: passthrough, onStart: passthrough };
  const panChain = { onUpdate: passthrough, onEnd: passthrough, onStart: passthrough };

  return {
    FlatList: FlatListMock,
    GestureHandlerRootView: ({
      children,
      style,
    }: {
      children?: React.ReactNode;
      style?: ViewProps['style'];
    }) => React.createElement(View, { style }, children),
    GestureDetector: ({ children }: { children?: React.ReactNode }) => children ?? null,
    Gesture: {
      Tap: () => ({ numberOfTaps: () => tapChain }),
      Pan: () => ({ minPointers: () => panChain }),
      Pinch: () => panChain,
      Simultaneous: () => ({}),
      Exclusive: () => ({}),
    },
  };
}

/**
 * Stub for `expo-image` that renders each source as the text `img:<uri>`, so a
 * suite can assert which image is on screen without a real decoder.
 *
 * `prefetch` adds the static `Image.prefetch` spy; `imageBackground` adds the
 * `ImageBackground` export, which renders its children and nothing else.
 */
export function mockExpoImage({
  testID,
  prefetch = false,
  imageBackground = false,
}: {
  testID?: string;
  prefetch?: boolean;
  imageBackground?: boolean;
} = {}) {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

  const Image = ({ source }: { source?: { uri?: string } }) =>
    React.createElement(Text, testID ? { testID } : null, `img:${source?.uri ?? ''}`);

  return {
    Image: prefetch ? Object.assign(Image, { prefetch: jest.fn() }) : Image,
    ...(imageBackground && {
      ImageBackground: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(Text, null, children),
    }),
  };
}
