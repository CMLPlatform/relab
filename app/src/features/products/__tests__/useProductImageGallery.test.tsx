import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useProductImageGallery } from '@/features/products/useProductImageGallery';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { baseProduct as _base } from '@/test-utils/index';
import type { Product } from '@/types/Product';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockFeedbackAlert = jest.fn();
const mockUseRpiIntegration: jest.Mock = jest.fn();
const mockUseCamerasQuery: jest.Mock = jest.fn();
const mockCaptureMutate: jest.Mock = jest.fn();

jest.mock('expo-image', () => ({
  Image: { prefetch: jest.fn() },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
  }),
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({
    alert: mockFeedbackAlert,
  }),
}));

jest.mock('@/features/cameras/rpi/useRpiIntegration', () => ({
  useRpiIntegration: () => mockUseRpiIntegration(),
}));

jest.mock('@/features/cameras/rpi/hooks', () => ({
  useCamerasQuery: (...args: unknown[]) => mockUseCamerasQuery(...args),
  useCaptureImageMutation: () => ({ mutate: mockCaptureMutate }),
}));

jest.mock('@/features/gallery/useGalleryIndexPersistence', () => ({
  useGalleryIndexPersistence: () => ({
    pendingIndex: null,
    consumePendingIndex: jest.fn(),
    persistIndex: jest.fn(async () => {}),
  }),
}));

jest.mock('@/features/gallery/useGalleryKeyboardNavigation', () => ({
  useGalleryKeyboardNavigation: jest.fn(),
}));

const baseProduct: Product = {
  ..._base,
  id: 42,
  name: 'Radio',
  images: [{ id: '1', url: 'https://example.com/image.jpg', description: '' }],
};

describe('useProductImageGallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRpiIntegration.mockReturnValue({ enabled: true });
    mockUseCamerasQuery.mockReturnValue({ data: [], isLoading: false });
  });

  it('returns derived gallery state for the current product', () => {
    const { result } = renderHook(() =>
      useProductImageGallery({
        product: baseProduct,
        editMode: true,
        onImagesChange: jest.fn(),
      }),
    );

    expect(result.current.media.imageCount).toBe(1);
    expect(result.current.capture.showRpiButton).toBe(true);
    expect(result.current.capture.hasCamerasConfigured).toBe(false);
    expect(result.current.viewer.selectedIndex).toBe(0);
  });

  it('alerts when trying to capture from an RPi camera before the product is saved', () => {
    const { result } = renderHook(() =>
      useProductImageGallery({
        product: { ...baseProduct, id: undefined } as Product,
        editMode: true,
        onImagesChange: jest.fn(),
      }),
    );

    act(() => {
      result.current.actions.requestRpiCapture();
    });

    expect(mockFeedbackAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save required' }),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('routes to camera setup when no RPi cameras are configured', () => {
    const { result } = renderHook(() =>
      useProductImageGallery({
        product: baseProduct,
        editMode: true,
        onImagesChange: jest.fn(),
      }),
    );

    act(() => {
      result.current.actions.requestRpiCapture();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/cameras');
  });

  it('opens and closes the lightbox through named actions', () => {
    const { result } = renderHook(() =>
      useProductImageGallery({
        product: baseProduct,
        editMode: true,
        onImagesChange: jest.fn(),
      }),
    );

    act(() => {
      result.current.actions.openLightbox(0);
    });
    expect(result.current.viewer.lightboxOpen).toBe(true);

    act(() => {
      result.current.actions.closeLightbox();
    });
    expect(result.current.viewer.lightboxOpen).toBe(false);
  });

  it('selects and dismisses the preview camera through named actions', () => {
    const camera = { id: 'cam-1', name: 'Bench Cam' } as CameraReadWithStatus;

    mockUseCamerasQuery.mockReturnValue({ data: [camera], isLoading: false });

    const { result } = renderHook(() =>
      useProductImageGallery({
        product: baseProduct,
        editMode: true,
        onImagesChange: jest.fn(),
      }),
    );

    act(() => {
      result.current.actions.selectPreviewCamera(camera);
    });
    expect(result.current.viewer.previewCamera).toEqual(camera);

    act(() => {
      result.current.actions.dismissPreview();
    });
    expect(result.current.viewer.previewCamera).toBeNull();
  });

  it('appends a captured image when the camera capture succeeds', () => {
    const onImagesChange = jest.fn();
    const camera = { id: 'cam-1', name: 'Bench Cam' } as CameraReadWithStatus;

    mockUseCamerasQuery.mockReturnValue({ data: [camera], isLoading: false });
    mockCaptureMutate.mockImplementation((_args, options) => {
      const typedOptions = options as {
        onSuccess?: (captured: {
          id: string;
          url: string;
          thumbnailUrl?: string | null;
          description: string;
        }) => void;
      };
      typedOptions.onSuccess?.({
        id: 'captured-1',
        url: '/media/capture.jpg',
        thumbnailUrl: '/media/capture-thumb.jpg',
        description: 'Captured frame',
      });
    });

    const { result } = renderHook(() =>
      useProductImageGallery({
        product: baseProduct,
        editMode: true,
        onImagesChange,
      }),
    );

    act(() => {
      result.current.actions.selectPreviewCamera(camera);
    });

    act(() => {
      result.current.actions.capturePreview();
    });

    expect(onImagesChange).toHaveBeenCalledWith([
      expect.objectContaining({ url: 'https://example.com/image.jpg' }),
      expect.objectContaining({
        id: 'captured-1',
        description: 'Captured frame',
      }),
    ]);
  });

  it('surfaces capture failures through feedback', () => {
    const camera = { id: 'cam-1', name: 'Bench Cam' } as CameraReadWithStatus;

    mockCaptureMutate.mockImplementation((_args, options) => {
      const typedOptions = options as { onError?: (error: Error) => void };
      typedOptions.onError?.(new Error('camera timeout'));
    });

    const { result } = renderHook(() =>
      useProductImageGallery({
        product: baseProduct,
        editMode: true,
        onImagesChange: jest.fn(),
      }),
    );

    act(() => {
      result.current.actions.selectPreviewCamera(camera);
    });

    act(() => {
      result.current.actions.capturePreview();
    });

    expect(mockFeedbackAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Capture failed' }),
    );
  });
});
