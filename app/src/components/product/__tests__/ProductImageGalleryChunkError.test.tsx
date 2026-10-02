import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import { baseProduct, renderWithProviders } from '@/test-utils/index';

const CHUNK_LOAD_FAILED_MESSAGE = "Couldn't load this. Check your connection and try again.";

const mockDialog = { alert: jest.fn(), toast: jest.fn(), input: jest.fn() };
jest.mock('@/components/base/dialogContext', () => ({
  ...jest.requireActual<typeof import('@/components/base/dialogContext')>(
    '@/components/base/dialogContext',
  ),
  useDialog: () => mockDialog,
}));

// The chunk fails once (offline, or a deploy replaced the hashed asset), then loads.
const mockLoadLightbox = jest.fn<() => Promise<{ default: () => React.JSX.Element }>>();
jest.mock('@/components/product/gallery/lightboxChunk', () => ({
  loadLightbox: () => mockLoadLightbox(),
  prefetchLightbox: () => {},
}));

// Only the lazy mount is under test; the visible gallery surface is stubbed out.
jest.mock('@/components/product/gallery/ProductImageGalleryContent', () => ({
  ProductImageGalleryContent: () => {
    const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <RNText>gallery</RNText>;
  },
}));
jest.mock('@/components/product/gallery/ProductImageThumbnails', () => ({
  ProductImageThumbnails: () => null,
}));

const mockCloseLightbox = jest.fn();
const mockViewer = { lightboxOpen: true };
jest.mock('@/features/products/useProductImageGallery', () => ({
  useProductImageGallery: () => ({
    media: { imageCount: 1, width: 300, items: [], galleryRef: { current: null } },
    viewer: {
      selectedIndex: 0,
      lightboxOpen: mockViewer.lightboxOpen,
      cameraPickerVisible: false,
      previewCamera: null,
    },
    capture: {},
    actions: {
      closeLightbox: mockCloseLightbox,
      dismissCameraPicker: jest.fn(),
      dismissPreview: jest.fn(),
    },
  }),
}));

function renderGallery() {
  return <ProductImageGallery product={baseProduct} editMode={false} />;
}

describe('ProductImageGallery on-demand chunks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockViewer.lightboxOpen = true;
  });

  it('survives a lightbox chunk that fails to load, raises a toast and retries on reopen', async () => {
    // React logs the caught error; the boundary handling it is what is under test.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    let online = false;
    mockLoadLightbox.mockImplementation(async () => {
      if (!online) throw new Error('Loading chunk 7 failed');
      return { default: () => <Text>lightbox</Text> };
    });

    const view = await renderWithProviders(renderGallery());

    await waitFor(() => expect(mockDialog.toast).toHaveBeenCalledWith(CHUNK_LOAD_FAILED_MESSAGE));
    // The rest of the page is still there, and the lightbox state is closed again.
    expect(screen.getByText('gallery')).toBeOnTheScreen();
    expect(screen.queryByText('lightbox')).toBeNull();
    expect(mockCloseLightbox).toHaveBeenCalled();

    // Back online, close then reopen: a fresh lazy() fetches the chunk again.
    online = true;
    const failedLoads = mockLoadLightbox.mock.calls.length;
    mockViewer.lightboxOpen = false;
    await view.rerender(renderGallery());
    mockViewer.lightboxOpen = true;
    await view.rerender(renderGallery());

    expect(await screen.findByText('lightbox')).toBeOnTheScreen();
    expect(mockLoadLightbox.mock.calls.length).toBeGreaterThan(failedLoads);
    consoleError.mockRestore();
  });
});
