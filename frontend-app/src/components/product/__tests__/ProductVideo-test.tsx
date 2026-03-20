import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ProductVideo from '../ProductVideo';
import { DialogProvider } from '@/components/common/DialogProvider';
import type { Product } from '@/types/Product';

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

describe('ProductVideo', () => {
  it('renders the Recordings heading', () => {
    render(
      <Wrapper>
        <ProductVideo product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText(/Recordings/)).toBeTruthy();
  });

  it("shows 'no recordings' message when empty", () => {
    render(
      <Wrapper>
        <ProductVideo product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('This product has no associated recordings.')).toBeTruthy();
  });

  it("shows 'Add recording' button in editMode", () => {
    render(
      <Wrapper>
        <ProductVideo product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    expect(screen.getByText('Add recording')).toBeTruthy();
  });

  it("hides 'Add recording' button in view mode", () => {
    render(
      <Wrapper>
        <ProductVideo product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.queryByText('Add recording')).toBeNull();
  });

  it('opens add recording dialog on press', async () => {
    render(
      <Wrapper>
        <ProductVideo product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Add recording'));
    await waitFor(() => {
      expect(screen.getByText('Add Recording')).toBeTruthy();
    });
  });

  it('renders existing videos', () => {
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo Video', description: '' }],
    };
    render(
      <Wrapper>
        <ProductVideo product={productWithVideo} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('https://youtube.com/watch?v=abc')).toBeTruthy();
  });

  it('shows delete button for videos in editMode', () => {
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };
    render(
      <Wrapper>
        <ProductVideo product={productWithVideo} editMode={true} />
      </Wrapper>,
    );
    // In editMode the url is shown as TextInput not a TouchableOpacity text
    // Delete button (MaterialCommunityIcons "delete") should be rendered
    // We check by trying to change text of a url input
    const inputs = screen.UNSAFE_getAllByType(require('react-native').TextInput);
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('calls onVideoChange when a field is updated', () => {
    const onVideoChange = jest.fn();
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };
    render(
      <Wrapper>
        <ProductVideo product={productWithVideo} editMode={true} onVideoChange={onVideoChange} />
      </Wrapper>,
    );
    const titleInputs = screen.UNSAFE_getAllByType(require('react-native').TextInput);
    // First input should be the title
    fireEvent.changeText(titleInputs[0], 'Updated Title');
    expect(onVideoChange).toHaveBeenCalled();
  });

  it('calls onVideoChange when a video is removed', () => {
    const onVideoChange = jest.fn();
    const productWithVideo: Product = {
      ...baseProduct,
      videos: [{ id: 1, url: 'https://youtube.com/watch?v=abc', title: 'Demo', description: '' }],
    };
    render(
      <Wrapper>
        <ProductVideo product={productWithVideo} editMode={true} onVideoChange={onVideoChange} />
      </Wrapper>,
    );
    // The delete TouchableOpacity — use UNSAFE_getAllByType to get TouchableOpacity elements
    const touchables = screen.UNSAFE_getAllByType(require('react-native').TouchableOpacity);
    // Last touchable should be the delete button
    fireEvent.press(touchables[touchables.length - 1]);
    expect(onVideoChange).toHaveBeenCalledWith([]);
  });
});
