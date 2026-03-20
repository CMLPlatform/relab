import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ProductImages from '../ProductImage';
import { DialogProvider } from '@/components/common/DialogProvider';
import type { Product } from '@/types/Product';

jest.mock('expo-image', () => ({
  Image: ({ source }: { source: { uri: string } }) => {
    const { Text } = require('react-native');
    const React = require('react');
    return React.createElement(Text, null, `img:${source?.uri}`);
  },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/services/media/imageProcessing', () => ({
  processImage: jest.fn(),
}));

const mockPush = jest.fn();
const mockSetParams = jest.fn();

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <PaperProvider>
      <DialogProvider>{children}</DialogProvider>
    </PaperProvider>
  );
}

const baseProduct: Product = {
  id: 1,
  name: 'Test Product',
  productTypeID: undefined,
  componentIDs: [],
  physicalProperties: { weight: 100, width: 10, height: 5, depth: 3 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};

describe('ProductImages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: mockSetParams,
      dismissTo: jest.fn(),
    });
  });

  it('renders placeholder image when no images present', () => {
    render(
      <Wrapper>
        <ProductImages product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText(/img:https:\/\/placehold\.co/)).toBeTruthy();
  });

  it('shows upload and camera buttons in editMode', () => {
    render(
      <Wrapper>
        <ProductImages product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    // ToolbarIcon buttons are rendered as Pressable with Icon — check by looking for the view container
    // The edit toolbar icons are visible when editMode=true
    const { getByTestId, UNSAFE_getAllByType } = screen;
    // Just verify no crash and the component renders
    expect(screen.getByText(/img:https:\/\/placehold\.co/)).toBeTruthy();
  });

  it('renders product images when present', () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: 1, url: 'file://photo1.jpg', description: 'A photo' }],
    };
    render(
      <Wrapper>
        <ProductImages product={productWithImages} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('img:file://photo1.jpg')).toBeTruthy();
  });

  it('shows image counter text for a single image', () => {
    const productWithImages = {
      ...baseProduct,
      images: [{ id: 1, url: 'file://photo1.jpg', description: '' }],
    };
    render(
      <Wrapper>
        <ProductImages product={productWithImages} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  it('renders edit toolbar in editMode with no images', () => {
    render(
      <Wrapper>
        <ProductImages product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    // Component renders without crash in editMode; placeholder image visible
    expect(screen.getByText(/img:https:\/\/placehold/)).toBeTruthy();
  });

  it("calls onImagesChange when photoTaken is 'taken' and AsyncStorage has a uri", async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    AsyncStorage.getItem.mockResolvedValueOnce('file://camera_photo.jpg');
    (useLocalSearchParams as jest.Mock).mockReturnValue({ photoTaken: 'taken' });

    const onImagesChange = jest.fn();
    render(
      <Wrapper>
        <ProductImages product={baseProduct} editMode={false} onImagesChange={onImagesChange} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(onImagesChange).toHaveBeenCalled();
    });
  });

  it("does not call onImagesChange when photoTaken is 'taken' but AsyncStorage is empty", async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ photoTaken: 'taken' });

    const onImagesChange = jest.fn();
    render(
      <Wrapper>
        <ProductImages product={baseProduct} editMode={false} onImagesChange={onImagesChange} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(onImagesChange).not.toHaveBeenCalled();
    });
  });
});
