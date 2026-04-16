import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import {
  ProductImageCameraDialogs,
  ProductImageEmptyEditState,
  ProductImageGalleryContent,
  ProductImageThumbnails,
} from '@/components/product/gallery/ProductImageGallerySections';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-image', () => ({
  Image: ({ source }: { source: { uri: string } }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement(Text, null, `img:${source.uri}`);
  },
}));

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
  return { FlatList: FlatListMock };
});

jest.mock('@/components/cameras/CameraPickerDialog', () => ({
  CameraPickerDialog: ({
    visible,
    onSelect,
  }: {
    visible: boolean;
    onSelect: (camera: { id: string; name: string }) => void;
  }) => {
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const React = jest.requireActual<typeof import('react')>('react');
    if (!visible) return null;
    return React.createElement(
      Pressable,
      { onPress: () => onSelect({ id: 'cam-1', name: 'Bench Cam' }) },
      React.createElement(Text, null, 'Select camera'),
    );
  },
}));

jest.mock('@/components/cameras/LivePreview', () => ({
  LivePreview: () => null,
}));

describe('ProductImageGallerySections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders gallery controls and wires the next action', () => {
    const onNext = jest.fn();

    renderWithProviders(
      <ProductImageGalleryContent
        width={320}
        imageCount={2}
        selectedIndex={0}
        mediumUrls={['a.jpg', 'b.jpg']}
        galleryRef={{ current: null }}
        onSelectIndex={jest.fn()}
        onOpenLightbox={jest.fn()}
        onPrev={jest.fn()}
        onNext={onNext}
        onScrollEnd={jest.fn()}
        editMode={true}
        showCameraOption={true}
        showRpiButton={true}
        hasCamerasConfigured={true}
        isCapturing={false}
        rpiCamerasLoading={false}
        onTakePhoto={jest.fn()}
        onPickImage={jest.fn()}
        onRpiCapture={jest.fn()}
        onDeleteImage={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText('Next image'));
    expect(onNext).toHaveBeenCalled();
  });

  it('renders empty edit state actions including RPi capture setup', () => {
    const onRpiCapture = jest.fn();

    renderWithProviders(
      <ProductImageEmptyEditState
        showCameraOption={true}
        showRpiButton={true}
        hasCamerasConfigured={false}
        isCapturing={false}
        rpiCamerasLoading={false}
        onTakePhoto={jest.fn()}
        onPickImage={jest.fn()}
        onRpiCapture={onRpiCapture}
      />,
    );

    fireEvent.press(screen.getByLabelText('Set up RPi camera'));
    expect(onRpiCapture).toHaveBeenCalled();
  });

  it('renders thumbnails and forwards selection actions', () => {
    const onSelectIndex = jest.fn();
    const onScrollToIndex = jest.fn();

    renderWithProviders(
      <ProductImageThumbnails
        imageCount={2}
        thumbnailUrls={['a.jpg', 'b.jpg']}
        selectedIndex={0}
        thumbsRef={{ current: null }}
        onSelectIndex={onSelectIndex}
        onScrollToIndex={onScrollToIndex}
      />,
    );

    fireEvent.press(screen.getByLabelText('Select image 2'));
    expect(onSelectIndex).toHaveBeenCalledWith(1);
    expect(onScrollToIndex).toHaveBeenCalledWith(1);
  });

  it('renders camera dialogs and forwards preview actions', () => {
    const onSelectCamera = jest.fn();
    const onCapturePreview = jest.fn();

    renderWithProviders(
      <ProductImageCameraDialogs
        cameraPickerVisible={true}
        previewCamera={{ id: 'cam-1', name: 'Bench Cam' } as never}
        isCapturing={false}
        onDismissCameraPicker={jest.fn()}
        onSelectCamera={onSelectCamera}
        onDismissPreview={jest.fn()}
        onCapturePreview={onCapturePreview}
      />,
      { withDialog: true },
    );

    fireEvent.press(screen.getByText('Select camera'));
    fireEvent.press(screen.getByText('Capture'));

    expect(onSelectCamera).toHaveBeenCalled();
    expect(onCapturePreview).toHaveBeenCalled();
  });
});
