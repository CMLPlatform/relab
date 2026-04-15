// spell-checker: ignore Zoomable
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type React from 'react';
import { View, type ViewProps } from 'react-native';
import * as imageProcessing from '@/services/media/imageProcessing';
import { baseProduct, mockPlatform, renderWithProviders } from '@/test-utils';
import type { Product } from '@/types/Product';
import ProductImages from '../ProductImageGallery';

type FlatListCallProps = {
  disableIntervalMomentum?: boolean;
  pagingEnabled?: boolean;
  getItemLayout?: (data: ArrayLike<string> | null | undefined, index: number) => unknown;
  onScrollBeginDrag?: (event: { nativeEvent: { contentOffset: { x: number } } }) => void;
  onScrollEndDrag?: (event: { nativeEvent: { contentOffset: { x: number } } }) => void;
  onMomentumScrollEnd?: (event: { nativeEvent: { contentOffset: { x: number } } }) => void;
};
type ZoomableImageMockProps = {
  uri: string;
  onSwipe?: (direction: -1 | 1) => void;
};
type GestureCallback = (...args: unknown[]) => unknown;

const mockFlatListCalls: Array<Record<string, unknown> & FlatListCallProps> = [];
const mockZoomableImageCalls: ZoomableImageMockProps[] = [];
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
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

jest.mock('@/components/common/DialogProvider', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    DialogProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useOptionalDialog: jest.fn(() => null),
  };
});

jest.mock('@/services/media/imageProcessing', () => ({
  processImage: jest.fn(),
}));

jest.mock('@/components/common/ZoomableImage', () => {
  return function ZoomableImageMock(props: ZoomableImageMockProps) {
    mockZoomableImageCalls.push(props);
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement(Text, null, `zoom:${props.uri}`);
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const FlatListMock = React.forwardRef(function FlatListMock(
    {
      data,
      renderItem,
      ...props
    }: {
      data?: unknown[];
      renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
      style?: ViewProps['style'];
      [key: string]: unknown;
    },
    ref: React.ForwardedRef<{ scrollToIndex: () => void; scrollToOffset: () => void }>,
  ) {
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
      Array.isArray(data) && renderItem
        ? data.map((item, index) =>
            React.createElement(React.Fragment, { key: index }, renderItem({ item, index })),
          )
        : null,
    );
  });
  FlatListMock.displayName = 'FlatListMock';

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
      Tap: () => ({
        numberOfTaps: () => ({
          onEnd: (cb: GestureCallback) => cb,
          onStart: (cb: GestureCallback) => cb,
        }),
      }),
      Pan: () => ({
        minPointers: () => ({
          onUpdate: (cb: GestureCallback) => cb,
          onEnd: (cb: GestureCallback) => cb,
          onStart: (cb: GestureCallback) => cb,
        }),
      }),
      Pinch: () => ({
        onUpdate: (cb: GestureCallback) => cb,
        onEnd: (cb: GestureCallback) => cb,
        onStart: (cb: GestureCallback) => cb,
      }),
      Simultaneous: () => ({}),
      Exclusive: () => ({}),
    },
  };
});

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockedLaunchImageLibraryAsync = jest.mocked(ImagePicker.launchImageLibraryAsync);
const mockedLaunchCameraAsync = jest.mocked(ImagePicker.launchCameraAsync);
const mockedRequestCameraPermissionsAsync = jest.mocked(ImagePicker.requestCameraPermissionsAsync);
const mockedProcessImage = jest.mocked(imageProcessing.processImage);
const mockUseRpiIntegration = jest.fn();
const mockUseCamerasQuery = jest.fn();
const mockUseCaptureImageMutation = jest.fn();

jest.mock('@/hooks/useRpiIntegration', () => ({
  useRpiIntegration: () => mockUseRpiIntegration(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useCamerasQuery: (...args: unknown[]) => mockUseCamerasQuery(...args),
  useCaptureImageMutation: () => mockUseCaptureImageMutation(),
}));

jest.mock('@/components/cameras/LivePreview', () => ({
  LivePreview: () => null,
}));

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
    value: jest.fn((event: string, handler: (event: { key: string }) => void) => {
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
    mockPlatform('ios');
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: mockSetParams,
      dismissTo: jest.fn(),
    });
    mockedLaunchImageLibraryAsync.mockReset();
    mockedLaunchCameraAsync.mockReset();
    mockedRequestCameraPermissionsAsync.mockReset();
    mockedProcessImage.mockReset();
    mockUseRpiIntegration.mockReset();
    mockUseCamerasQuery.mockReset();
    mockUseCaptureImageMutation.mockReset();
    mockUseRpiIntegration.mockReturnValue({
      enabled: false,
      loading: false,
      setEnabled: jest.fn(),
    });
    mockUseCamerasQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseCaptureImageMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    mockFlatListCalls.length = 0;
    mockZoomableImageCalls.length = 0;
    keydownHandler = null;
  });

  it('renders placeholder image when no images present', () => {
    renderWithProviders(<ProductImages product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getByTestId('image-placeholder')).toBeOnTheScreen();
  });

  it('renders placeholder image when product.images is missing', () => {
    renderWithProviders(
      <ProductImages
        product={{ ...baseProduct, images: undefined } as unknown as Product}
        editMode={false}
      />,
      {
        withDialog: true,
      },
    );
    expect(screen.getByTestId('image-placeholder')).toBeOnTheScreen();
  });

  it('renders product images when present', () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: '1', url: 'file://photo1.jpg', description: 'A photo' }],
    };
    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getByText('img:file://photo1.jpg')).toBeOnTheScreen();
  });

  it('does not show image counter text for a single image', () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: '1', url: 'file://photo1.jpg', description: '' }],
    };
    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.queryByText('1 / 1')).toBeNull();
  });

  it('does not show image counter in editMode with no images', () => {
    renderWithProviders(<ProductImages product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.queryByText(/\/ /)).toBeNull();
  });

  it('shows main gallery chevrons and advances selection when pressed', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: '1', url: 'file://photo1.jpg', description: '' },
        { id: '2', url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, {
      withDialog: true,
    });

    expect(screen.getByLabelText('Previous image')).toBeOnTheScreen();
    expect(screen.getByLabelText('Next image')).toBeOnTheScreen();

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

    renderWithProviders(
      <ProductImages product={baseProduct} editMode={true} onImagesChange={onImagesChange} />,
      {
        withDialog: true,
      },
    );

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

    renderWithProviders(
      <ProductImages product={baseProduct} editMode={true} onImagesChange={onImagesChange} />,
      {
        withDialog: true,
      },
    );

    fireEvent.press(screen.getByText('Add Photos'));

    await waitFor(() => {
      expect(onImagesChange).not.toHaveBeenCalled();
    });
  });

  it('opens lightbox when image is pressed', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: '1', url: 'file://photo1.jpg', description: '' },
        { id: '2', url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, {
      withDialog: true,
    });

    const imgs = screen.getAllByText('img:file://photo1.jpg');
    fireEvent.press(imgs[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeOnTheScreen();
    });
  });

  it('closes lightbox when close button is pressed', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: '1', url: 'file://photo1.jpg', description: '' }],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getByText('img:file://photo1.jpg'));

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeOnTheScreen();
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
        { id: '1', url: 'file://photo1.jpg', description: '' },
        { id: '2', url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    const { UNSAFE_getAllByProps } = renderWithProviders(
      <ProductImages product={productWithImages} editMode={false} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeOnTheScreen();
      expect(screen.getAllByText('1 / 2').length).toBeGreaterThan(0);
    });

    const lightboxListProps = mockFlatListCalls.find(
      (props) => props.disableIntervalMomentum === true,
    );

    expect(lightboxListProps).toBeTruthy();
    if (!lightboxListProps?.getItemLayout) {
      throw new Error('Expected lightbox list getItemLayout to exist');
    }
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
    if (!rightArrow || !leftArrow) {
      throw new Error('Expected both lightbox arrow buttons to exist');
    }

    fireEvent.press(rightArrow);

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });

    fireEvent.press(leftArrow);

    await waitFor(() => {
      expect(screen.getAllByText('1 / 2').length).toBeGreaterThan(0);
    });
  });

  it('navigates between lightbox images with touch gestures on web', async () => {
    mockPlatform('web');
    setMatchMedia(true);
    setWindowImageConstructor();
    setWindowEventListeners();

    const productWithImages = {
      ...baseProduct,
      images: [
        { id: '1', url: 'file://photo1.jpg', description: '' },
        { id: '2', url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    const { UNSAFE_getAllByType } = renderWithProviders(
      <ProductImages product={productWithImages} editMode={false} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeOnTheScreen();
    });

    const touchTarget = UNSAFE_getAllByType(View).find(
      (node) =>
        typeof node.props.onTouchStart === 'function' &&
        typeof node.props.onTouchEnd === 'function',
    );

    expect(touchTarget).toBeTruthy();
    if (!touchTarget) {
      throw new Error('Expected touch target to exist');
    }

    fireEvent(touchTarget, 'touchStart', {
      nativeEvent: { touches: [{ pageX: 240 }] },
    });
    fireEvent(touchTarget, 'touchEnd', {
      nativeEvent: { changedTouches: [{ pageX: 120 }] },
    });

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });
  });

  it('handles keyboard and scroll navigation on web lightbox', async () => {
    mockPlatform('web');
    setMatchMedia(false);
    setWindowImageConstructor();
    setWindowEventListeners();

    const productWithImages = {
      ...baseProduct,
      images: [
        { id: '1', url: 'file://photo1.jpg', description: '' },
        { id: '2', url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeOnTheScreen();
    });

    const lightboxListProps = mockFlatListCalls.find(
      (props) => props.disableIntervalMomentum === true,
    );
    expect(lightboxListProps).toBeTruthy();
    if (!lightboxListProps?.onScrollBeginDrag || !lightboxListProps.onScrollEndDrag) {
      throw new Error('Expected lightbox scroll handlers to exist');
    }
    const { onScrollBeginDrag, onScrollEndDrag } = lightboxListProps;

    act(() => {
      onScrollBeginDrag({
        nativeEvent: { contentOffset: { x: 0 } },
      });
      onScrollEndDrag({
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
        { id: '1', url: 'file://photo1.jpg', description: '' },
        { id: '2', url: 'file://photo2.jpg', description: '' },
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
    if (!mainGalleryListProps?.onMomentumScrollEnd) {
      throw new Error('Expected main gallery scroll handler to exist');
    }
    const { onMomentumScrollEnd: onMainGalleryMomentumScrollEnd } = mainGalleryListProps;

    act(() => {
      onMainGalleryMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 9999 } },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });

    const highlightedThumbs = UNSAFE_getAllByType(View).filter((node) => {
      const style = Array.isArray(node.props.style)
        ? Object.assign({}, ...node.props.style)
        : node.props.style;
      return style?.borderColor === '#2196F3';
    });

    expect(highlightedThumbs.length).toBe(1);
  });

  it('persists the active image when swiping in the lightbox and closing it', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: '1', url: 'file://photo1.jpg', description: '' },
        { id: '2', url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeOnTheScreen();
    });

    const lightboxListProps = mockFlatListCalls.find(
      (props) => props.disableIntervalMomentum === true,
    );
    expect(lightboxListProps).toBeTruthy();
    if (!lightboxListProps?.onMomentumScrollEnd) {
      throw new Error('Expected lightbox momentum handler to exist');
    }
    const { onMomentumScrollEnd: onLightboxMomentumScrollEnd } = lightboxListProps;

    act(() => {
      onLightboxMomentumScrollEnd({
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

  it('shows Camera and Add Photos tiles on native when no images in edit mode', () => {
    renderWithProviders(<ProductImages product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.getByText('Camera')).toBeOnTheScreen();
    expect(screen.getByText('Add Photos')).toBeOnTheScreen();
  });

  it('shows only Add Photos tile on desktop web when no images in edit mode', () => {
    mockPlatform('web');
    setMatchMedia(false);
    setWindowImageConstructor();
    setWindowEventListeners();
    renderWithProviders(<ProductImages product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.queryByText('Camera')).toBeNull();
    expect(screen.getByText('Add Photos')).toBeOnTheScreen();
  });

  it('shows Camera and Add Photos tiles on mobile web when no images in edit mode', () => {
    mockPlatform('web');
    setMatchMedia(true);
    setWindowImageConstructor();
    setWindowEventListeners();
    renderWithProviders(<ProductImages product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.getByText('Camera')).toBeOnTheScreen();
    expect(screen.getByText('Add Photos')).toBeOnTheScreen();
  });

  it('requests camera permission then calls launchCameraAsync when Camera tile is pressed on native', async () => {
    const onImagesChange = jest.fn();
    mockedRequestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'granted' } as never);
    mockedLaunchCameraAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://camera_photo.jpg', width: 100, height: 100 }],
    } as never);
    mockedProcessImage.mockResolvedValueOnce('file://processed.jpg');

    renderWithProviders(
      <ProductImages product={baseProduct} editMode={true} onImagesChange={onImagesChange} />,
      {
        withDialog: true,
      },
    );

    fireEvent.press(screen.getByText('Camera'));

    await waitFor(() => {
      expect(mockedRequestCameraPermissionsAsync).toHaveBeenCalled();
      expect(mockedLaunchCameraAsync).toHaveBeenCalled();
      expect(onImagesChange).toHaveBeenCalledWith([
        ...baseProduct.images,
        { url: 'file://processed.jpg', description: '' },
      ]);
    });
  });

  it('does not call onImagesChange when camera permission is denied', async () => {
    const onImagesChange = jest.fn();
    mockedRequestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as never);

    renderWithProviders(
      <ProductImages product={baseProduct} editMode={true} onImagesChange={onImagesChange} />,
      {
        withDialog: true,
      },
    );

    fireEvent.press(screen.getByText('Camera'));

    await waitFor(() => {
      expect(mockedRequestCameraPermissionsAsync).toHaveBeenCalled();
      expect(mockedLaunchCameraAsync).not.toHaveBeenCalled();
      expect(onImagesChange).not.toHaveBeenCalled();
    });
  });

  it('shows Take photo and Add photo from gallery overlay icons on native with images in edit mode', () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: '1', url: 'file://photo1.jpg', description: '' }],
    };
    renderWithProviders(<ProductImages product={productWithImages} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.getByLabelText('Take photo')).toBeOnTheScreen();
    expect(screen.getByLabelText('Add photo from gallery')).toBeOnTheScreen();
  });

  it('hides Take photo overlay icon on desktop web with images in edit mode', () => {
    mockPlatform('web');
    setMatchMedia(false);
    setWindowImageConstructor();
    setWindowEventListeners();
    const productWithImages = {
      ...baseProduct,
      images: [{ id: '1', url: 'file://photo1.jpg', description: '' }],
    };
    renderWithProviders(<ProductImages product={productWithImages} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.queryByLabelText('Take photo')).toBeNull();
    expect(screen.getByLabelText('Add photo from gallery')).toBeOnTheScreen();
  });

  it('shows Take photo overlay icon on mobile web with images in edit mode', () => {
    mockPlatform('web');
    setMatchMedia(true);
    setWindowImageConstructor();
    setWindowEventListeners();
    const productWithImages = {
      ...baseProduct,
      images: [{ id: '1', url: 'file://photo1.jpg', description: '' }],
    };
    renderWithProviders(<ProductImages product={productWithImages} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.getByLabelText('Take photo')).toBeOnTheScreen();
    expect(screen.getByLabelText('Add photo from gallery')).toBeOnTheScreen();
  });

  it('calls launchCameraAsync without requesting permission when Take photo overlay is pressed on web', async () => {
    mockPlatform('web');
    setMatchMedia(true);
    setWindowImageConstructor();
    setWindowEventListeners();
    const onImagesChange = jest.fn();
    mockedLaunchCameraAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://camera_photo.jpg', width: 100, height: 100 }],
    } as never);
    mockedProcessImage.mockResolvedValueOnce('file://processed.jpg');

    const productWithImages = {
      ...baseProduct,
      images: [{ id: '1', url: 'file://photo1.jpg', description: '' }],
    };
    renderWithProviders(
      <ProductImages product={productWithImages} editMode={true} onImagesChange={onImagesChange} />,
      {
        withDialog: true,
      },
    );

    fireEvent.press(screen.getByLabelText('Take photo'));

    await waitFor(() => {
      expect(mockedRequestCameraPermissionsAsync).not.toHaveBeenCalled();
      expect(mockedLaunchCameraAsync).toHaveBeenCalled();
      expect(onImagesChange).toHaveBeenCalled();
    });
  });

  it('advances the lightbox index when a zoomed image requests a swipe navigation', async () => {
    const productWithImages = {
      ...baseProduct,
      images: [
        { id: '1', url: 'file://photo1.jpg', description: '' },
        { id: '2', url: 'file://photo2.jpg', description: '' },
      ],
    } as Product;

    renderWithProviders(<ProductImages product={productWithImages} editMode={false} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getAllByText('img:file://photo1.jpg')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close lightbox')).toBeOnTheScreen();
    });

    const zoomableImageProps = mockZoomableImageCalls.find(
      (props) => props.uri === 'file://photo1.jpg',
    );
    expect(zoomableImageProps).toBeTruthy();
    if (!zoomableImageProps?.onSwipe) {
      throw new Error('Expected zoomable image swipe callback to exist');
    }
    const { onSwipe } = zoomableImageProps;

    act(() => {
      onSwipe(1);
    });

    await waitFor(() => {
      expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
    });
  });
});
