import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { baseProduct, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';
import ProductVideo from '../ProductVideo';

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  return {
    WebView: ({ source }: { source?: { uri?: string } }) =>
      React.createElement(
        View,
        { testID: 'mock-webview' },
        React.createElement(Text, null, source?.uri ?? ''),
      ),
  };
});

type ProductVideoProps = ComponentProps<typeof ProductVideo>;

const defaultProps: ProductVideoProps = {
  product: baseProduct,
  editMode: false,
  streamingThisProduct: false,
  streamingOtherProduct: false,
  activeStream: null,
  rpiEnabled: false,
  youtubeEnabled: false,
  isGoogleLinked: false,
  ownedByMe: false,
  isNew: false,
  isProductComponent: false,
  onGoLivePress: jest.fn(),
  onNavigateToProfile: jest.fn(),
  onNavigateToActiveStream: jest.fn(),
};
const VIDEO_HEADING_PATTERN = /Video/;

function renderProductVideo(overrides: Partial<ProductVideoProps> = {}) {
  return renderWithProviders(<ProductVideo {...defaultProps} {...overrides} />, {
    withDialog: true,
  });
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: product-video coverage keeps one end-to-end fixture set for the whole feature surface.
describe('ProductVideo', () => {
  it('renders the Video heading', () => {
    renderProductVideo();
    expect(screen.getByText(VIDEO_HEADING_PATTERN)).toBeOnTheScreen();
  });

  it("shows 'no associated videos' message when empty", () => {
    renderProductVideo();
    expect(screen.getByText('This product has no associated videos.')).toBeOnTheScreen();
  });

  it("shows 'Add video' button in edit mode", () => {
    renderProductVideo({ editMode: true });
    expect(screen.getByText('Add video')).toBeOnTheScreen();
  });

  it("hides 'Add video' button in view mode", () => {
    renderProductVideo();
    expect(screen.queryByText('Add video')).toBeNull();
  });

  it('opens add video dialog on press', async () => {
    renderProductVideo({ editMode: true });
    fireEvent.press(screen.getByText('Add video'));
    expect(await screen.findByText('Add Video')).toBeOnTheScreen();
  });

  it('renders existing non-youtube video URLs in view mode', () => {
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://example.com/demo', title: 'Demo Video', description: '' }],
    };

    renderProductVideo({ product: productWithVideo });
    fireEvent.press(screen.getByText('Show (1)'));
    expect(screen.getByText('https://example.com/demo')).toBeOnTheScreen();
  });

  it('renders title and URL inputs for videos in edit mode', () => {
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };

    renderProductVideo({ product: productWithVideo, editMode: true });
    expect(screen.getByPlaceholderText('Title')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Video URL')).toBeOnTheScreen();
  });

  it('calls onVideoChange when a title field is updated', () => {
    const onVideoChange = jest.fn();
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };

    renderProductVideo({ product: productWithVideo, editMode: true, onVideoChange });
    fireEvent.changeText(screen.getByPlaceholderText('Title'), 'Updated Title');
    expect(onVideoChange).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Updated Title' }),
    ]);
  });

  it('disables Add in the dialog when URL is empty or invalid', async () => {
    renderProductVideo({ editMode: true });
    fireEvent.press(screen.getByText('Add video'));
    expect(await screen.findByText('Add Video')).toBeOnTheScreen();

    expect(screen.getByText('Add')).toBeDisabled();

    fireEvent.changeText(screen.getByPlaceholderText('Video URL'), 'not-a-url');
    expect(screen.getByText('Add')).toBeDisabled();
  });

  it('submitting a valid URL appends the video and calls onVideoChange', async () => {
    const onVideoChange = jest.fn();
    renderProductVideo({ editMode: true, onVideoChange });

    fireEvent.press(screen.getByText('Add video'));
    expect(await screen.findByText('Add Video')).toBeOnTheScreen();

    fireEvent.changeText(
      screen.getByPlaceholderText('Video URL'),
      'https://youtube.com/watch?v=test123',
    );
    fireEvent.press(screen.getByText('Add'));

    expect(onVideoChange).toHaveBeenCalledWith([
      expect.objectContaining({
        url: 'https://youtube.com/watch?v=test123',
        title: '',
        description: '',
      }),
    ]);
  });

  it('calls onVideoChange when the URL field is updated', () => {
    const onVideoChange = jest.fn();
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };

    renderProductVideo({ product: productWithVideo, editMode: true, onVideoChange });
    fireEvent.changeText(screen.getByPlaceholderText('Video URL'), 'https://vimeo.com/123');
    expect(onVideoChange).toHaveBeenCalledWith([
      expect.objectContaining({ url: 'https://vimeo.com/123' }),
    ]);
  });

  it('shows description field when a video has a non-empty description in view mode', () => {
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [
        {
          id: 1,
          url: 'https://youtube.com/watch?v=abc',
          title: 'Demo',
          description: 'A great talk',
        },
      ],
    };

    renderProductVideo({ product: productWithVideo });
    fireEvent.press(screen.getByText('Show (1)'));
    expect(screen.getByDisplayValue('A great talk')).toBeOnTheScreen();
  });

  it('calls onVideoChange when a video is removed', () => {
    const onVideoChange = jest.fn();
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };

    renderProductVideo({ product: productWithVideo, editMode: true, onVideoChange });
    fireEvent.press(screen.getByTestId('delete-video-0'));
    expect(onVideoChange).toHaveBeenCalledWith([]);
  });

  it('shows the go live CTA when the product is eligible to stream', () => {
    const onGoLivePress = jest.fn();

    renderProductVideo({
      rpiEnabled: true,
      ownedByMe: true,
      isGoogleLinked: true,
      youtubeEnabled: true,
      onGoLivePress,
    });

    fireEvent.press(screen.getByText('Go Live'));
    expect(onGoLivePress).toHaveBeenCalled();
  });

  it('shows Go Live button even when YouTube is not set up, with setup prompt on press', async () => {
    const onGoLivePress = jest.fn();

    renderProductVideo({
      rpiEnabled: true,
      ownedByMe: true,
      isGoogleLinked: false,
      youtubeEnabled: false,
      onGoLivePress,
    });

    expect(screen.getByText('Go Live')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Go Live'));
    expect(onGoLivePress).not.toHaveBeenCalled();
    expect(await screen.findByText('Set up YouTube Live')).toBeOnTheScreen();
  });
});
