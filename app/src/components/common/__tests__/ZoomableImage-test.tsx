// spell-checker: ignore Zoomable

import { act, render, screen } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';
import ZoomableImage from '../ZoomableImage';

describe('ZoomableImage', () => {
  const testUri = 'https://example.com/image.jpg';
  type PinchGestureType = ReturnType<typeof Gesture.Pinch>;
  type PanGestureType = ReturnType<typeof Gesture.Pan>;
  type TapGestureType = ReturnType<typeof Gesture.Tap>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with uri', () => {
    render(<ZoomableImage uri={testUri} />);
    const image = screen.getByTestId('expo-image');
    expect(image).toBeOnTheScreen();
    expect(image.props.source).toEqual({ uri: testUri });
  });

  it('executes pinch update callback', () => {
    const mockPinch = {
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const onScaleChange = jest.fn();
    const setIsZoomed = jest.fn();
    jest.spyOn(Gesture, 'Pinch').mockReturnValue(mockPinch as unknown as PinchGestureType);

    render(<ZoomableImage uri={testUri} onScaleChange={onScaleChange} setIsZoomed={setIsZoomed} />);

    // Call the callback captured by onUpdate
    const onUpdate = mockPinch.onUpdate.mock.calls[0][0];
    act(() => {
      onUpdate({ scale: 2 });
    });

    expect(onScaleChange).toHaveBeenLastCalledWith(2);
    expect(setIsZoomed).toHaveBeenLastCalledWith(true);
  });

  it('resets a light pinch back to the default zoom state', () => {
    const mockPinch = {
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    const onScaleChange = jest.fn();
    const setIsZoomed = jest.fn();
    jest.spyOn(Gesture, 'Pinch').mockReturnValue(mockPinch as unknown as PinchGestureType);

    render(<ZoomableImage uri={testUri} onScaleChange={onScaleChange} setIsZoomed={setIsZoomed} />);

    const onUpdate = mockPinch.onUpdate.mock.calls[0][0];
    const onEnd = mockPinch.onEnd.mock.calls[0][0];

    act(() => {
      onUpdate({ scale: 0.8 });
      onEnd();
    });

    expect(onScaleChange).toHaveBeenLastCalledWith(1);
    expect(setIsZoomed).toHaveBeenLastCalledWith(false);
  });

  it('executes pan update callback', () => {
    const mockPan = {
      enabled: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onStart: jest.fn().mockReturnThis(),
    };
    jest.spyOn(Gesture, 'Pan').mockReturnValue(mockPan as unknown as PanGestureType);

    render(<ZoomableImage uri={testUri} />);

    const onUpdate = mockPan.onUpdate.mock.calls[0][0];
    const onEnd = mockPan.onEnd.mock.calls[0][0];
    act(() => {
      onUpdate({ translationX: 10, translationY: 20 });
      onEnd();
    });
  });

  it('emits a swipe callback when a zoomed image is swiped horizontally', () => {
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

    render(<ZoomableImage uri={testUri} onSwipe={onSwipe} setIsZoomed={setIsZoomed} />);

    const pinchUpdate = mockPinch.onUpdate.mock.calls[0][0];
    const pinchEnd = mockPinch.onEnd.mock.calls[0][0];
    const panUpdate = mockPan.onUpdate.mock.calls[0][0];
    const panEnd = mockPan.onEnd.mock.calls[0][0];

    act(() => {
      pinchUpdate({ scale: 2 });
      pinchEnd();
      panUpdate({ translationX: 120, translationY: 10 });
      panEnd();
    });

    expect(onSwipe).toHaveBeenLastCalledWith(-1);
    expect(setIsZoomed).toHaveBeenLastCalledWith(false);
  });

  it('executes double tap end callback', () => {
    const mockTap = {
      numberOfTaps: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
    };
    const onScaleChange = jest.fn();
    const setIsZoomed = jest.fn();
    jest.spyOn(Gesture, 'Tap').mockReturnValue(mockTap as unknown as TapGestureType);

    render(<ZoomableImage uri={testUri} onScaleChange={onScaleChange} setIsZoomed={setIsZoomed} />);

    const onEnd = mockTap.onEnd.mock.calls[0][0];
    act(() => {
      onEnd();
    });

    expect(onScaleChange).toHaveBeenLastCalledWith(2);
    expect(setIsZoomed).toHaveBeenLastCalledWith(true);
  });

  it('resets a zoomed image when double tapped again', () => {
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

    render(<ZoomableImage uri={testUri} onScaleChange={onScaleChange} setIsZoomed={setIsZoomed} />);

    const pinchUpdate = mockPinch.onUpdate.mock.calls[0][0];
    const pinchEnd = mockPinch.onEnd.mock.calls[0][0];
    const onEnd = mockTap.onEnd.mock.calls[0][0];

    act(() => {
      pinchUpdate({ scale: 2 });
      pinchEnd();
      onEnd();
    });

    expect(onScaleChange).toHaveBeenLastCalledWith(1);
    expect(setIsZoomed).toHaveBeenLastCalledWith(false);
  });
});
