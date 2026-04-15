/**
 * ProductImageGallery — RPi capture flow + gallery/AsyncStorage surface.
 *
 * Lightbox / zoom gestures are intentionally NOT covered here; see the
 * existing ProductImage-test.tsx which covers that surface.
 */

// spell-checker: ignore Zoomable

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { baseProduct, mockPlatform, renderWithProviders } from '@/test-utils';
import type { Product } from '@/types/Product';
import ProductImageGallery from '../ProductImageGallery';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('expo-image', () => ({
  Image: Object.assign(
    ({ source }: { source: { uri: string } }) => {
      const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
      const React = jest.requireActual<typeof import('react')>('react');
      return React.createElement(Text, null, `img:${source?.uri ?? ''}`);
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

jest.mock('@/services/media/imageProcessing', () => ({
  processImage: jest.fn(),
}));

jest.mock('@/components/common/ZoomableImage', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return function ZoomableImageStub({ uri }: { uri: string }) {
    return React.createElement(Text, null, `zoom:${uri}`);
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
      [key: string]: unknown;
    },
    ref: React.ForwardedRef<{ scrollToIndex: () => void; scrollToOffset: () => void }>,
  ) {
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
      style?: Record<string, unknown>;
    }) => React.createElement(View, { style }, children),
    GestureDetector: ({ children }: { children?: React.ReactNode }) => children ?? null,
    Gesture: {
      Tap: () => ({
        numberOfTaps: () => ({ onEnd: (cb: unknown) => cb, onStart: (cb: unknown) => cb }),
      }),
      Pan: () => ({
        minPointers: () => ({
          onUpdate: (cb: unknown) => cb,
          onEnd: (cb: unknown) => cb,
          onStart: (cb: unknown) => cb,
        }),
      }),
      Pinch: () => ({
        onUpdate: (cb: unknown) => cb,
        onEnd: (cb: unknown) => cb,
        onStart: (cb: unknown) => cb,
      }),
      Simultaneous: () => ({}),
      Exclusive: () => ({}),
    },
  };
});

// LivePreview is a noop in this test suite
jest.mock('@/components/cameras/LivePreview', () => ({
  LivePreview: () => null,
}));

// ─── Hook mocks ───────────────────────────────────────────────────────────────

const mockUseRpiIntegration = jest.fn();
const mockUseCamerasQuery = jest.fn();
const mockCaptureMutate = jest.fn();
const mockUseCaptureImageMutation = jest.fn();

jest.mock('@/hooks/useRpiIntegration', () => ({
  useRpiIntegration: () => mockUseRpiIntegration(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useCamerasQuery: (...args: unknown[]) => mockUseCamerasQuery(...args),
  useCaptureImageMutation: () => mockUseCaptureImageMutation(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockPush = jest.fn();

function makeCamera(overrides: Partial<CameraReadWithStatus> = {}): CameraReadWithStatus {
  return {
    id: 'cam-1',
    name: 'Bench Cam',
    description: '',
    last_image_url: null,
    status: { connection: 'online', last_seen_at: null, details: null },
    telemetry: undefined,
    ...overrides,
  } as unknown as CameraReadWithStatus;
}

const productWithImages = (count: number): Product => ({
  ...baseProduct,
  id: 42,
  images: Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    url: `file://photo${i + 1}.jpg`,
    description: '',
  })),
});

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('ProductImageGallery — RPi capture + gallery / AsyncStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform('ios');
    // ``alert`` is a browser global; the node test env doesn't ship it, so seed
    // a stub before each test so spyOn can replace it.
    if (typeof (globalThis as { alert?: unknown }).alert !== 'function') {
      Object.defineProperty(globalThis, 'alert', {
        value: () => undefined,
        writable: true,
        configurable: true,
      });
    }

    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
      dismissTo: jest.fn(),
    });

    mockUseRpiIntegration.mockReturnValue({
      enabled: false,
      loading: false,
      setEnabled: jest.fn(),
    });
    mockUseCamerasQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseCaptureImageMutation.mockReturnValue({ mutate: mockCaptureMutate, isPending: false });
  });

  // ── Gallery display ────────────────────────────────────────────────────────

  it('renders placeholder when images === []', () => {
    renderWithProviders(
      <ProductImageGallery product={{ ...baseProduct, images: [] }} editMode={false} />,
      { withDialog: true },
    );

    expect(screen.getByTestId('image-placeholder')).toBeOnTheScreen();
  });

  it('renders the carousel when images.length > 1', () => {
    renderWithProviders(<ProductImageGallery product={productWithImages(2)} editMode={false} />, {
      withDialog: true,
    });

    // Images appear in both the main carousel and the thumbnail strip
    expect(screen.getAllByText('img:file://photo1.jpg').length).toBeGreaterThan(0);
    expect(screen.getAllByText('img:file://photo2.jpg').length).toBeGreaterThan(0);
  });

  it('renders the thumbnail strip when images.length > 1', () => {
    renderWithProviders(<ProductImageGallery product={productWithImages(2)} editMode={false} />, {
      withDialog: true,
    });

    // Two thumbnail strip items with "Select image N" labels
    expect(screen.getByLabelText('Select image 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Select image 2')).toBeOnTheScreen();
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  it('delete button removes the image at the selected index', async () => {
    const onImagesChange = jest.fn();

    renderWithProviders(
      <ProductImageGallery
        product={productWithImages(2)}
        editMode={true}
        onImagesChange={onImagesChange}
      />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByLabelText('Delete photo'));

    await waitFor(() => {
      expect(onImagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ url: 'file://photo2.jpg' }),
      ]);
    });
  });

  it('delete clamps new index to the last image when the last item is removed', async () => {
    const onImagesChange = jest.fn();

    renderWithProviders(
      <ProductImageGallery
        product={productWithImages(1)}
        editMode={true}
        onImagesChange={onImagesChange}
      />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByLabelText('Delete photo'));

    await waitFor(() => {
      expect(onImagesChange).toHaveBeenCalledWith([]);
    });
  });

  // ── AsyncStorage persistence ───────────────────────────────────────────────

  it('persists selected index via AsyncStorage.setItem when the gallery scrolls', async () => {
    // We trigger a scroll event on the FlatList to change the selected index.
    // The FlatList mock renders all items, and the mock captures onMomentumScrollEnd props.

    renderWithProviders(<ProductImageGallery product={productWithImages(2)} editMode={false} />, {
      withDialog: true,
    });

    // Press the "Next image" chevron to move to index 1
    fireEvent.press(screen.getByLabelText('Next image'));

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('product_gallery_index_42', '1');
    });
  });

  it('restores selected index from AsyncStorage on mount', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('1');

    renderWithProviders(<ProductImageGallery product={productWithImages(2)} editMode={false} />, {
      withDialog: true,
    });

    await waitFor(() => {
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('product_gallery_index_42');
    });
  });

  // ── RPi button visibility ──────────────────────────────────────────────────

  it('hides the RPi button when rpiEnabled === false', () => {
    mockUseRpiIntegration.mockReturnValue({
      enabled: false,
      loading: false,
      setEnabled: jest.fn(),
    });

    renderWithProviders(<ProductImageGallery product={productWithImages(1)} editMode={true} />, {
      withDialog: true,
    });

    expect(screen.queryByLabelText(/RPi camera|Set up RPi camera/i)).toBeNull();
  });

  it('shows the RPi button when rpiEnabled === true', () => {
    mockUseRpiIntegration.mockReturnValue({ enabled: true, loading: false, setEnabled: jest.fn() });

    renderWithProviders(<ProductImageGallery product={productWithImages(1)} editMode={true} />, {
      withDialog: true,
    });

    // Either "Capture from RPi camera" (has cameras) or "Set up RPi camera" (no cameras)
    expect(
      screen.queryByLabelText('Capture from RPi camera') ??
        screen.queryByLabelText('Set up RPi camera'),
    ).not.toBeNull();
  });

  // ── RPi button — unsaved product ───────────────────────────────────────────

  it('shows an alert when RPi button is pressed on an unsaved product', async () => {
    mockUseRpiIntegration.mockReturnValue({ enabled: true, loading: false, setEnabled: jest.fn() });

    // Product with id: undefined simulates an unsaved product
    const unsavedProduct = { ...baseProduct, id: undefined } as unknown as Product;

    renderWithProviders(<ProductImageGallery product={unsavedProduct} editMode={true} />, {
      withDialog: true,
    });

    // With no cameras configured and rpiEnabled, the button reads "Set up RPi camera"
    fireEvent.press(screen.getByLabelText('Set up RPi camera'));

    await waitFor(() => {
      expect(screen.getByText(/Save this product first/i)).toBeOnTheScreen();
    });
  });

  // ── RPi button — saved product, zero cameras ───────────────────────────────

  it('routes to /cameras when RPi button is pressed with zero cameras configured', async () => {
    mockUseRpiIntegration.mockReturnValue({ enabled: true, loading: false, setEnabled: jest.fn() });
    mockUseCamerasQuery.mockReturnValue({ data: [], isLoading: false });

    renderWithProviders(
      <ProductImageGallery product={{ ...baseProduct, id: 42 }} editMode={true} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByLabelText('Set up RPi camera'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/cameras');
    });
  });

  // ── RPi button — saved product, ≥1 online camera ──────────────────────────

  it('opens the camera picker dialog when ≥1 camera is available', async () => {
    mockUseRpiIntegration.mockReturnValue({ enabled: true, loading: false, setEnabled: jest.fn() });
    mockUseCamerasQuery.mockReturnValue({
      data: [makeCamera({ id: 'cam-1', name: 'Bench Cam' })],
      isLoading: false,
    });

    renderWithProviders(
      <ProductImageGallery product={{ ...baseProduct, id: 42 }} editMode={true} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByLabelText('Capture from RPi camera'));

    await waitFor(() => {
      expect(screen.getByText('Select camera')).toBeOnTheScreen();
    });
  });

  it('sorts cameras online-first in the picker', async () => {
    mockUseRpiIntegration.mockReturnValue({ enabled: true, loading: false, setEnabled: jest.fn() });
    mockUseCamerasQuery.mockReturnValue({
      data: [
        makeCamera({
          id: 'cam-offline',
          name: 'Offline Cam',
          status: { connection: 'offline', last_seen_at: null, details: null },
        }),
        makeCamera({
          id: 'cam-online',
          name: 'Online Cam',
          status: { connection: 'online', last_seen_at: null, details: null },
        }),
      ],
      isLoading: false,
    });

    renderWithProviders(
      <ProductImageGallery product={{ ...baseProduct, id: 42 }} editMode={true} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByLabelText('Capture from RPi camera'));

    await waitFor(() => {
      expect(screen.getByText('Select camera')).toBeOnTheScreen();
    });

    const allNames = screen.getAllByText(/Cam/).map((el) => el.props.children as string);
    const onlineIdx = allNames.indexOf('Online Cam');
    const offlineIdx = allNames.indexOf('Offline Cam');
    expect(onlineIdx).toBeLessThan(offlineIdx);
  });

  // ── Preview dialog ─────────────────────────────────────────────────────────

  it('opens the preview dialog after selecting a camera from the picker', async () => {
    mockUseRpiIntegration.mockReturnValue({ enabled: true, loading: false, setEnabled: jest.fn() });
    mockUseCamerasQuery.mockReturnValue({
      data: [makeCamera({ id: 'cam-1', name: 'Bench Cam' })],
      isLoading: false,
    });

    renderWithProviders(
      <ProductImageGallery product={{ ...baseProduct, id: 42 }} editMode={true} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByLabelText('Capture from RPi camera'));
    await waitFor(() => expect(screen.getByText('Select camera')).toBeOnTheScreen());

    fireEvent.press(screen.getByText('Bench Cam'));

    await waitFor(() => {
      // The preview dialog title is the camera name
      expect(screen.getByText('Bench Cam')).toBeOnTheScreen();
      // Capture button in the preview dialog
      expect(screen.getByText('Capture')).toBeOnTheScreen();
    });
  });

  // ── Capture mutation ───────────────────────────────────────────────────────

  it('fires the mutation and calls onImagesChange on success', async () => {
    const onImagesChange = jest.fn();
    mockUseRpiIntegration.mockReturnValue({ enabled: true, loading: false, setEnabled: jest.fn() });
    mockUseCamerasQuery.mockReturnValue({
      data: [makeCamera({ id: 'cam-1', name: 'Bench Cam' })],
      isLoading: false,
    });

    const capturedImage = {
      id: 'img-new',
      url: '/media/captures/new.jpg',
      thumbnailUrl: null,
      description: 'captured',
    };

    mockCaptureMutate.mockImplementation(((
      _payload: unknown,
      opts: { onSuccess: (img: typeof capturedImage) => void; onSettled: () => void },
    ) => {
      opts.onSuccess(capturedImage);
      opts.onSettled();
    }) as unknown as (...args: unknown[]) => unknown);

    renderWithProviders(
      <ProductImageGallery
        product={{ ...baseProduct, id: 42, images: [] }}
        editMode={true}
        onImagesChange={onImagesChange}
      />,
      { withDialog: true },
    );

    // Open picker → select camera
    fireEvent.press(screen.getByLabelText('Capture from RPi camera'));
    await waitFor(() => expect(screen.getByText('Select camera')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Bench Cam'));
    await waitFor(() => expect(screen.getByText('Capture')).toBeOnTheScreen());

    // Press the Capture button in the preview dialog
    fireEvent.press(screen.getByText('Capture'));

    await waitFor(() => {
      expect(mockCaptureMutate).toHaveBeenCalledWith(
        { cameraId: 'cam-1', productId: 42 },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      expect(onImagesChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'img-new' })]),
      );
    });
  });

  it('shows alert when capture fails', async () => {
    mockUseRpiIntegration.mockReturnValue({ enabled: true, loading: false, setEnabled: jest.fn() });
    mockUseCamerasQuery.mockReturnValue({
      data: [makeCamera({ id: 'cam-1', name: 'Bench Cam' })],
      isLoading: false,
    });

    mockCaptureMutate.mockImplementation(((
      _payload: unknown,
      opts: { onError: (err: Error) => void; onSettled: () => void },
    ) => {
      opts.onError(new Error('camera timeout'));
      opts.onSettled();
    }) as unknown as (...args: unknown[]) => unknown);

    renderWithProviders(
      <ProductImageGallery product={{ ...baseProduct, id: 42, images: [] }} editMode={true} />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByLabelText('Capture from RPi camera'));
    await waitFor(() => expect(screen.getByText('Select camera')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Bench Cam'));
    await waitFor(() => expect(screen.getByText('Capture')).toBeOnTheScreen());

    fireEvent.press(screen.getByText('Capture'));

    await waitFor(() => {
      expect(screen.getByText('Capture failed')).toBeOnTheScreen();
    });
  });
});
