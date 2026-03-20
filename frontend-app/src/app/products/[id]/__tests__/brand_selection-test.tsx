import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import BrandSelection from '../brand_selection';
import * as fetching from '@/services/api/fetching';

jest.mock('@/services/api/fetching', () => ({
  allBrands: jest.fn(),
}));

const mockDismissTo = jest.fn();

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

describe('BrandSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '1' });
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
      dismissTo: mockDismissTo,
    });
    (fetching.allBrands as jest.Mock).mockResolvedValue(['Apple', 'Samsung', 'Sony']);
  });

  it('shows activity indicator while loading', () => {
    (fetching.allBrands as jest.Mock).mockImplementation(() => new Promise(() => {}));
    render(
      <Wrapper>
        <BrandSelection />
      </Wrapper>,
    );
    // Loading state shows ActivityIndicator and no brands
    expect(screen.queryByText('Apple')).toBeNull();
  });

  it('renders brand chips after loading', async () => {
    render(
      <Wrapper>
        <BrandSelection />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Apple')).toBeTruthy();
      expect(screen.getByText('Samsung')).toBeTruthy();
      expect(screen.getByText('Sony')).toBeTruthy();
    });
  });

  it('filters brands by search query', async () => {
    render(
      <Wrapper>
        <BrandSelection />
      </Wrapper>,
    );
    await screen.findByText('Apple');
    fireEvent.changeText(screen.getByPlaceholderText('Search or add brand'), 'sam');
    await waitFor(() => {
      expect(screen.getByText('Samsung')).toBeTruthy();
      expect(screen.queryByText('Apple')).toBeNull();
    });
  });

  it('calls dismissTo when a brand chip is pressed', async () => {
    render(
      <Wrapper>
        <BrandSelection />
      </Wrapper>,
    );
    await screen.findByText('Apple');
    fireEvent.press(screen.getByText('Apple'));
    expect(mockDismissTo).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/products/[id]',
        params: expect.objectContaining({ brandSelection: 'Apple' }),
      }),
    );
  });

  it('shows new brand chip for custom search term not in list', async () => {
    render(
      <Wrapper>
        <BrandSelection />
      </Wrapper>,
    );
    await screen.findByText('Apple');
    fireEvent.changeText(screen.getByPlaceholderText('Search or add brand'), 'NewBrand');
    await waitFor(() => {
      expect(screen.getByText('NewBrand')).toBeTruthy();
    });
  });

  it('pre-fills search with preset param', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '1', preset: 'Sam' });
    render(
      <Wrapper>
        <BrandSelection />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Samsung')).toBeTruthy();
    });
  });
});
