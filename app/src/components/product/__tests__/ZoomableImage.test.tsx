import { act, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import ZoomableImage, { type ZoomableImageHandle } from '@/components/product/ZoomableImage';

describe('ZoomableImage', () => {
  const testUri = 'https://example.com/image.jpg';
  type PinchGestureType = ReturnType<typeof Gesture.Pinch>;
  type PanGestureType = ReturnType<typeof Gesture.Pan>;
  type TapGestureType = ReturnType<typeof Gesture.Tap>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with uri', async () => {
    await render(<ZoomableImage uri={testUri} />);
    const image = screen.getByTestId('expo-image');
    expect(image).toBeOnTheScreen();
    expect(image.props.source).toEqual({ uri: testUri });
  });

  it('defaults to a decorative (empty) accessibilityLabel', async () => {
    await render(<ZoomableImage uri={testUri} />);
    expect(screen.getByTestId('expo-image').props.accessibilityLabel).toBe('');
  });

  it('forwards a caller-supplied accessibilityLabel', async () => {
    await render(
      <ZoomableImage uri={testUri} accessibilityLabel="Close-up of the motor housing" />,
    );
    expect(screen.getByTestId('expo-image').props.accessibilityLabel).toBe(
      'Close-up of the motor housing',
    );
  });

  it('executes pinch update callback', async () => {
    const mockPinch = {
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const onScaleChange = jest.fn();
    const setIsZoomed = jest.fn();
    jest.spyOn(Gesture, 'Pinch').mockReturnValue(mockPinch as unknown as PinchGestureType);

    await render(
      <ZoomableImage uri={testUri} onScaleChange={onScaleChange} setIsZoomed={setIsZoomed} />,
    );

    // Call the callback captured by onUpdate
    const onUpdate = mockPinch.onUpdate.mock.calls[0][0];
    await act(() => {
      onUpdate({ scale: 2 });
    });

    expect(onScaleChange).toHaveBeenLastCalledWith(2);
    expect(setIsZoomed).toHaveBeenLastCalledWith(true);
  });

  it('resets a light pinch back to the default zoom state', async () => {
    const mockPinch = {
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const onScaleChange = jest.fn();
    const setIsZoomed = jest.fn();
    jest.spyOn(Gesture, 'Pinch').mockReturnValue(mockPinch as unknown as PinchGestureType);

    await render(
      <ZoomableImage uri={testUri} onScaleChange={onScaleChange} setIsZoomed={setIsZoomed} />,
    );

    const onUpdate = mockPinch.onUpdate.mock.calls[0][0];
    const onEnd = mockPinch.onEnd.mock.calls[0][0];

    await act(() => {
      onUpdate({ scale: 0.8 });
      onEnd();
    });

    expect(onScaleChange).toHaveBeenLastCalledWith(1);
    expect(setIsZoomed).toHaveBeenLastCalledWith(false);
  });

  it('executes pan update callback', async () => {
    const mockPan = {
      enabled: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    jest.spyOn(Gesture, 'Pan').mockReturnValue(mockPan as unknown as PanGestureType);

    await render(<ZoomableImage uri={testUri} />);

    const onUpdate = mockPan.onUpdate.mock.calls[0][0];
    const onEnd = mockPan.onEnd.mock.calls[0][0];
    await act(() => {
      onUpdate({ translationX: 10, translationY: 20 });
      onEnd({ translationX: 10, translationY: 20 });
    });
  });

  it('emits a swipe callback when a zoomed image is swiped horizontally', async () => {
    const mockPinch = {
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const mockPan = {
      enabled: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const onSwipe = jest.fn();
    const setIsZoomed = jest.fn();

    jest.spyOn(Gesture, 'Pinch').mockReturnValue(mockPinch as unknown as PinchGestureType);
    jest.spyOn(Gesture, 'Pan').mockReturnValue(mockPan as unknown as PanGestureType);

    await render(<ZoomableImage uri={testUri} onSwipe={onSwipe} setIsZoomed={setIsZoomed} />);

    const pinchUpdate = mockPinch.onUpdate.mock.calls[0][0];
    const pinchEnd = mockPinch.onEnd.mock.calls[0][0];
    const panUpdate = mockPan.onUpdate.mock.calls[0][0];
    const panEnd = mockPan.onEnd.mock.calls[0][0];

    await act(() => {
      pinchUpdate({ scale: 2 });
      pinchEnd();
      panUpdate({ translationX: 120, translationY: 10 });
      panEnd({ translationX: 120, translationY: 10 });
    });

    expect(onSwipe).toHaveBeenLastCalledWith(-1);
    expect(setIsZoomed).toHaveBeenLastCalledWith(false);
  });

  it('does not swipe when a zoomed image is panned across several small drags', async () => {
    const mockPinch = {
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const mockPan = {
      enabled: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const onSwipe = jest.fn();

    jest.spyOn(Gesture, 'Pinch').mockReturnValue(mockPinch as unknown as PinchGestureType);
    jest.spyOn(Gesture, 'Pan').mockReturnValue(mockPan as unknown as PanGestureType);

    await render(<ZoomableImage uri={testUri} onSwipe={onSwipe} />);

    const pinchUpdate = mockPinch.onUpdate.mock.calls[0][0];
    const pinchEnd = mockPinch.onEnd.mock.calls[0][0];
    const panUpdate = mockPan.onUpdate.mock.calls[0][0];
    const panEnd = mockPan.onEnd.mock.calls[0][0];

    // Each drag stays under the swipe threshold but they accumulate far past it.
    // Comparing the accumulated offset rather than the per-gesture delta fires onSwipe here.
    await act(() => {
      pinchUpdate({ scale: 2 });
      pinchEnd();
      for (let i = 0; i < 4; i++) {
        panUpdate({ translationX: 40, translationY: 0 });
        panEnd({ translationX: 40, translationY: 0 });
      }
    });

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('scales the swipe threshold to the measured container width, not the window', async () => {
    const mockPinch = {
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const mockPan = {
      enabled: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const onSwipe = jest.fn();

    jest.spyOn(Gesture, 'Pinch').mockReturnValue(mockPinch as unknown as PinchGestureType);
    jest.spyOn(Gesture, 'Pan').mockReturnValue(mockPan as unknown as PanGestureType);

    await render(<ZoomableImage uri={testUri} onSwipe={onSwipe} />);

    // A 100pt-wide container puts the 15% threshold at 15pt, well under the
    // window-width threshold the module-level constant used to impose.
    await act(() => {
      screen.getByTestId('zoomable-image').props.onLayout({
        nativeEvent: { layout: { width: 100, height: 100 } },
      });
    });

    const pinchUpdate = mockPinch.onUpdate.mock.calls[0][0];
    const pinchEnd = mockPinch.onEnd.mock.calls[0][0];
    const panUpdate = mockPan.onUpdate.mock.calls[0][0];
    const panEnd = mockPan.onEnd.mock.calls[0][0];

    await act(() => {
      pinchUpdate({ scale: 2 });
      pinchEnd();
      panUpdate({ translationX: 20, translationY: 0 });
      panEnd({ translationX: 20, translationY: 0 });
    });

    expect(onSwipe).toHaveBeenLastCalledWith(-1);
  });

  it('fills its slide rather than a width measured at module load', async () => {
    await render(<ZoomableImage uri={testUri} />);

    expect(StyleSheet.flatten(screen.getByTestId('zoomable-image').props.style)).toEqual(
      expect.objectContaining({ width: '100%', height: '100%' }),
    );
  });

  it('zooms in, out and resets through the imperative handle', async () => {
    const onScaleChange = jest.fn();
    const setIsZoomed = jest.fn();
    const zoomRef = createRef<ZoomableImageHandle>();

    await render(
      <ZoomableImage
        uri={testUri}
        zoomRef={zoomRef}
        onScaleChange={onScaleChange}
        setIsZoomed={setIsZoomed}
      />,
    );

    await act(() => zoomRef.current?.zoomBy(1));
    expect(onScaleChange).toHaveBeenLastCalledWith(2);
    expect(setIsZoomed).toHaveBeenLastCalledWith(true);

    await act(() => zoomRef.current?.reset());
    expect(onScaleChange).toHaveBeenLastCalledWith(1);
    expect(setIsZoomed).toHaveBeenLastCalledWith(false);

    // Stepping below 1 clamps to the identity scale instead of inverting.
    await act(() => zoomRef.current?.zoomBy(1));
    await act(() => zoomRef.current?.zoomBy(-2));
    expect(onScaleChange).toHaveBeenLastCalledWith(1);
  });

  it('executes double tap end callback', async () => {
    const mockTap = {
      numberOfTaps: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
    };
    const onScaleChange = jest.fn();
    const setIsZoomed = jest.fn();
    jest.spyOn(Gesture, 'Tap').mockReturnValue(mockTap as unknown as TapGestureType);

    await render(
      <ZoomableImage uri={testUri} onScaleChange={onScaleChange} setIsZoomed={setIsZoomed} />,
    );

    const onEnd = mockTap.onEnd.mock.calls[0][0];
    await act(() => {
      onEnd();
    });

    expect(onScaleChange).toHaveBeenLastCalledWith(2);
    expect(setIsZoomed).toHaveBeenLastCalledWith(true);
  });

  it('resets a zoomed image when double tapped again', async () => {
    const mockPinch = {
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const mockTap = {
      numberOfTaps: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
    };
    const onScaleChange = jest.fn();
    const setIsZoomed = jest.fn();

    jest.spyOn(Gesture, 'Pinch').mockReturnValue(mockPinch as unknown as PinchGestureType);
    jest.spyOn(Gesture, 'Tap').mockReturnValue(mockTap as unknown as TapGestureType);

    await render(
      <ZoomableImage uri={testUri} onScaleChange={onScaleChange} setIsZoomed={setIsZoomed} />,
    );

    const pinchUpdate = mockPinch.onUpdate.mock.calls[0][0];
    const pinchEnd = mockPinch.onEnd.mock.calls[0][0];
    const onEnd = mockTap.onEnd.mock.calls[0][0];

    await act(() => {
      pinchUpdate({ scale: 2 });
      pinchEnd();
      onEnd();
    });

    expect(onScaleChange).toHaveBeenLastCalledWith(1);
    expect(setIsZoomed).toHaveBeenLastCalledWith(false);
  });
});
