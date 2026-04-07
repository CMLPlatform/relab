import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { baseProduct, renderWithProviders } from '@/test-utils';
import type { Product } from '@/types/Product';
import ProductVideo from '../ProductVideo';

describe('ProductVideo', () => {
  it('renders the Recordings heading', () => {
    renderWithProviders(<ProductVideo product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getByText(/Recordings/)).toBeOnTheScreen();
  });

  it("shows 'no recordings' message when empty", () => {
    renderWithProviders(<ProductVideo product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getByText('This product has no associated recordings.')).toBeOnTheScreen();
  });

  it("shows 'Add recording' button in editMode", () => {
    renderWithProviders(<ProductVideo product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.getByText('Add recording')).toBeOnTheScreen();
  });

  it("hides 'Add recording' button in view mode", () => {
    renderWithProviders(<ProductVideo product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.queryByText('Add recording')).toBeNull();
  });

  it('opens add recording dialog on press', async () => {
    renderWithProviders(<ProductVideo product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText('Add recording'));
    await waitFor(() => {
      expect(screen.getByText('Add Recording')).toBeOnTheScreen();
    });
  });

  it('renders existing videos', () => {
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [
        { id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo Video', description: '' },
      ],
    };
    renderWithProviders(<ProductVideo product={productWithVideo} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getByText('https://youtube.com/watch?v=abc')).toBeOnTheScreen();
  });

  it('shows title and URL inputs for videos in editMode', () => {
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };
    renderWithProviders(<ProductVideo product={productWithVideo} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.getByPlaceholderText('Title')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Video URL')).toBeOnTheScreen();
  });

  it('calls onVideoChange when a field is updated', () => {
    const onVideoChange = jest.fn();
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };
    renderWithProviders(
      <ProductVideo product={productWithVideo} editMode={true} onVideoChange={onVideoChange} />,
      {
        withDialog: true,
      },
    );
    fireEvent.changeText(screen.getByPlaceholderText('Title'), 'Updated Title');
    expect(onVideoChange).toHaveBeenCalled();
  });

  it('Add button in dialog is disabled when URL is empty or invalid', async () => {
    renderWithProviders(<ProductVideo product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText('Add recording'));
    await screen.findByText('Add Recording');

    // No input yet; Add should be disabled
    expect(screen.getByText('Add')).toBeDisabled();

    // Non-URL text; still disabled
    fireEvent.changeText(screen.getByPlaceholderText('Video URL'), 'not-a-url');
    expect(screen.getByText('Add')).toBeDisabled();
  });

  it('submitting a valid URL in the add recording dialog appends the video and calls onVideoChange', async () => {
    const onVideoChange = jest.fn();
    renderWithProviders(
      <ProductVideo product={baseProduct} editMode={true} onVideoChange={onVideoChange} />,
      {
        withDialog: true,
      },
    );

    fireEvent.press(screen.getByText('Add recording'));
    await screen.findByText('Add Recording');

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
    renderWithProviders(
      <ProductVideo product={productWithVideo} editMode={true} onVideoChange={onVideoChange} />,
      {
        withDialog: true,
      },
    );
    fireEvent.changeText(screen.getByPlaceholderText('Video URL'), 'https://vimeo.com/123');
    expect(onVideoChange).toHaveBeenCalled();
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
    renderWithProviders(<ProductVideo product={productWithVideo} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getByPlaceholderText('Add description (optional)')).toBeOnTheScreen();
  });

  it('calls onVideoChange when a video is removed', () => {
    const onVideoChange = jest.fn();
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };
    renderWithProviders(
      <ProductVideo product={productWithVideo} editMode={true} onVideoChange={onVideoChange} />,
      {
        withDialog: true,
      },
    );
    fireEvent.press(screen.getByTestId('delete-video-0'));
    expect(onVideoChange).toHaveBeenCalledWith([]);
  });
});
