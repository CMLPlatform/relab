// spell-checker: ignore Zoomable
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, View } from 'react-native';
import ProductImages from '../ProductImageGallery';
import type { Product } from '@/types/Product';
import { baseProduct, renderWithProviders } from '@/test-utils';
import * as imageProcessing from '@/services/media/imageProcessing';

const mockFlatListCalls: any[] = [];
const mockZoomableImageCalls: any[] = [];
let keydownHandler: ((event: { key: string }) => void) | null = null;

jest.mock('expo-image', () => ({
  Image: Object.assign(
    ({ source }: { source: { uri: string } }) => {
      const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
      const React = jest.requireActual<typeof import('react')>('react');
      return React.createElement(Text, null, `img:${source?.uri}`);
    },
    { prefetch: jest.fn() },
  ),
  ImageBackground: ({ children }: { children?: React.ReactNode }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement(Text, null, children);
  },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/services/media/imageProcessing', () => ({
  processImage: jest.fn(),
}));

jest.mock('@/components/common/ZoomableImage', () => {
  return function ZoomableImageMock(props: any) {
    mockZoomableImageCalls.push(props);
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement(Text, null, `zoom:${props.uri}`);
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const FlatListMock = React.forwardRef(function FlatListMock({ data, renderItem, ...props }: any, ref: any) {
    mockFlatListCalls.push(props);
    React.useImperativeHandle(
      ref,
      () => ({
        scrollToIndex: jest.fn(),
        scrollToOffset: jest.fn(),
      }),
      [],
    );

    return React.createElement(
      View,
      props,
      Array.isArray(data)
        ? data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item, index })))
        : null,
    );
  });
  FlatListMock.displayName = 'FlatListMock';

  return {
    FlatList: FlatListMock,
    GestureHandlerRootView: ({ children, style }: any) => React.createElement(View, { style }, children),
    GestureDetector: ({ children }: any) => children,
    Gesture: {
      Tap: () => ({ numberOfTaps: () => ({ onEnd: (cb: any) => cb, onStart: (cb: any) => cb }) }),
      Pan: () => ({
        minPointers: () => ({
          onUpdate: (cb: any) => cb,
          onEnd: (cb: any) => cb,
          onStart: (cb: any) => cb,
        }),
      }),
      Pinch: () => ({
        onUpdate: (cb: any) => cb,
        onEnd: (cb: any) => cb,
        onStart: (cb: any) => cb,
      }),
      Simultaneous: () => ({}),
      Exclusive: () => ({}),
    },
  };
});

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockedLaunchImageLibraryAsync = jest.mocked(ImagePicker.launchImageLibraryAsync);
const mockedProcessImage = jest.mocked(imageProcessing.processImage);

function setPlatformOS(os: 'ios' | 'web') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn().mockImplementation(() => ({
      matches,
      media: '(pointer: coarse)',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

function setWindowImageConstructor() {
  Object.defineProperty(window, 'Image', {
    configurable: true,
    value: class MockImage {
      src = '';
    },
  });
}

function setWindowEventListeners() {
  Object.defineProperty(window, 'addEventListener', {
    configurable: true,
    value: jest.fn((event: string, handler: any) => {
      if (event === 'keydown') {
        keydownHandler = handler;
      }
    }),
  });
  Object.defineProperty(window, 'removeEventListener', {
    configurable: true,
    value: jest.fn(),
  });
}

describe('ProductImages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatformOS('ios');
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: mockSetParams,
      dismissTo: jest.fn(),
    });
    mockedLaunchImageLibraryAsync.mockReset();
    mockedProcessImage.mockReset();
    mockFlatListCalls.length = 0;
    mockZoomableImageCalls.length = 0;
    keydownHandler = null;
  });

  it('renders placeholder image when no images present', () => {
    renderWithProviders(<ProductImages product={baseProduct} editMode={false} />, { withDialog: true });
    expect(screen.getByText(/img:.*placehold\.co/)).toBeTruthy();
  });

  it('renders placeholder image when product.images is missing', () => {
    renderWithProviders(<ProductImages product={{ ...baseProduct, images: undefined as any }} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getByText(/img:.*placehold\.co/)).toBeTruthy();
  });

  it('renders product images when present', () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: 1, url: 'file://photo1.jpg', description: 'A photo' }],
    };
    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, { withDialog: true });
    expect(screen.getByText('img:file://photo1.jpg')).toBeTruthy();
  });

  it('does not show image counter text for a single image', () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: 1, url: 'file://photo1.jpg', description: '' }],
    };
    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, { withDialog: true });
    expect(screen.queryByText('1 / 1')).toBeNull();
  });

  it('does not show image counter in editMode with no images', () => {
    renderWithProviders(<ProductImages product={baseProduct} editMode={true} />, { withDialog: true });
    expect(screen.queryByText(/\/ /)).toBeNull();
  });

  it('shows main gallery chevrons and advances selection when pressed', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: 1, url: 'file://photo1.jpg', description: '' },
        { id: 2, url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, { withDialog: true });

    expect(screen.getByLabelText('Previous image')).toBeTruthy();
    expect(screen.getByLabelText('Next image')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Next image'));

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });
  });

  it('calls onImagesChange when a new image is picked', async () => {
    const onImagesChange = jest.fn();
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://camera_photo.jpg', width: 100, height: 100 }],
    } as never);
    mockedProcessImage.mockResolvedValueOnce('file://processed.jpg');

    renderWithProviders(<ProductImages product={baseProduct} editMode={true} onImagesChange={onImagesChange} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getByText('Add Photos'));

    await waitFor(() => {
      expect(onImagesChange).toHaveBeenCalledWith([
        ...baseProduct.images,
        { url: 'file://processed.jpg', description: '' },
      ]);
    });
  });

  it('does not call onImagesChange when the picker is canceled', async () => {
    const onImagesChange = jest.fn();
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] } as never);

    renderWithProviders(<ProductImages product={baseProduct} editMode={true} onImagesChange={onImagesChange} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getByText('Add Photos'));

    await waitFor(() => {
      expect(onImagesChange).not.toHaveBeenCalled();
    });
  });

  it('opens lightbox when image is pressed', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: 1, url: 'file://photo1.jpg', description: '' },
        { id: 2, url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, { withDialog: true });

    const imgs = screen.getAllByText('img:file://photo1.jpg');
    fireEvent.press(imgs[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeTruthy();
    });
  });

  it('closes lightbox when close button is pressed', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: 1, url: 'file://photo1.jpg', description: '' }],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, { withDialog: true });

    fireEvent.press(screen.getByText('img:file://photo1.jpg'));

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Close lightbox'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Close lightbox')).toBeNull();
    });
  });

  it('passes the lightbox layout metrics to the modal list and supports arrow navigation', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: 1, url: 'file://photo1.jpg', description: '' },
        { id: 2, url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    const { UNSAFE_getAllByProps } = renderWithProviders(
      <ProductImages product={productWithImages} editMode={false} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeTruthy();
      expect(screen.getAllByText('1 / 2').length).toBeGreaterThan(0);
    });

    const lightboxListProps = mockFlatListCalls.find((props) => props.disableIntervalMomentum === true);

    expect(lightboxListProps).toBeTruthy();
    expect(lightboxListProps.getItemLayout(null, 1)).toEqual({
      length: expect.any(Number),
      offset: expect.any(Number),
      index: 1,
    });

    const arrowButtons = UNSAFE_getAllByProps({ hitSlop: 15 }).filter(
      (node) => node.props.hitSlop === 15 && typeof node.props.onPress === 'function',
    );

    const leftArrow = arrowButtons.find((node) => node.props.disabled === true);
    const rightArrow = arrowButtons.find((node) => node.props.disabled === false);

    expect(leftArrow).toBeTruthy();
    expect(rightArrow).toBeTruthy();

    fireEvent.press(rightArrow!);

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });

    fireEvent.press(leftArrow!);

    await waitFor(() => {
      expect(screen.getAllByText('1 / 2').length).toBeGreaterThan(0);
    });
  });

  it('navigates between lightbox images with touch gestures on web', async () => {
    setPlatformOS('web');
    setMatchMedia(true);
    setWindowImageConstructor();
    setWindowEventListeners();

    const productWithImages = {
      ...baseProduct,
      images: [
        { id: 1, url: 'file://photo1.jpg', description: '' },
        { id: 2, url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    const { UNSAFE_getAllByType } = renderWithProviders(
      <ProductImages product={productWithImages} editMode={false} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeTruthy();
    });

    const touchTarget = UNSAFE_getAllByType(View).find(
      (node) => typeof node.props.onTouchStart === 'function' && typeof node.props.onTouchEnd === 'function',
    );

    expect(touchTarget).toBeTruthy();

    fireEvent(touchTarget!, 'touchStart', {
      nativeEvent: { touches: [{ clientX: 240 }] },
    });
    fireEvent(touchTarget!, 'touchEnd', {
      nativeEvent: { changedTouches: [{ clientX: 120 }] },
    });

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });
  });

  it('handles keyboard and scroll navigation on web lightbox', async () => {
    setPlatformOS('web');
    setMatchMedia(false);
    setWindowImageConstructor();
    setWindowEventListeners();

    const productWithImages = {
      ...baseProduct,
      images: [
        { id: 1, url: 'file://photo1.jpg', description: '' },
        { id: 2, url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, { withDialog: true });

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeTruthy();
    });

    const lightboxListProps = mockFlatListCalls.find((props) => props.disableIntervalMomentum === true);
    expect(lightboxListProps).toBeTruthy();

    act(() => {
      lightboxListProps.onScrollBeginDrag({
        nativeEvent: { contentOffset: { x: 0 } },
      });
      lightboxListProps.onScrollEndDrag({
        nativeEvent: { contentOffset: { x: 9999 } },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });

    act(() => {
      keydownHandler?.({ key: 'Escape' });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Close lightbox')).toBeNull();
    });
  });

  it('keeps the gallery counter and thumbnail highlight in sync after swiping', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: 1, url: 'file://photo1.jpg', description: '' },
        { id: 2, url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    const { UNSAFE_getAllByType } = renderWithProviders(
      <ProductImages product={productWithImages} editMode={false} />,
      { withDialog: true },
    );

    const mainGalleryListProps = mockFlatListCalls.find(
      (props) => props.pagingEnabled === true && props.disableIntervalMomentum !== true,
    );
    expect(mainGalleryListProps).toBeTruthy();

    act(() => {
      mainGalleryListProps.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 9999 } },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });

    const highlightedThumbs = UNSAFE_getAllByType(View).filter((node) => {
      const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style;
      return style?.borderColor === '#2196F3';
    });

    expect(highlightedThumbs.length).toBe(1);
  });

  it('persists the active image when swiping in the lightbox and closing it', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: 1, url: 'file://photo1.jpg', description: '' },
        { id: 2, url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, { withDialog: true });

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeTruthy();
    });

    const lightboxListProps = mockFlatListCalls.find((props) => props.disableIntervalMomentum === true);
    expect(lightboxListProps).toBeTruthy();

    act(() => {
      lightboxListProps.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 9999 } },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByLabelText('Close lightbox'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Close lightbox')).toBeNull();
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
      expect(screen.getAllByText('img:file://photo2.jpg').length).toBeGreaterThan(0);
    });
  });

  it('advances the lightbox index when a zoomed image requests a swipe navigation', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: 1, url: 'file://photo1.jpg', description: '' },
        { id: 2, url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, { withDialog: true });

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeTruthy();
    });

    const zoomableImageProps = mockZoomableImageCalls.find((props) => props.uri === 'file://photo1.jpg');
    expect(zoomableImageProps).toBeTruthy();

    act(() => {
      zoomableImageProps.onSwipe(1);
    });

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });
  });
});
