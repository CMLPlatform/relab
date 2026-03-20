import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CategorySelection from '../category_selection';

jest.mock('@/assets/data/cpv.json', () => ({
  root: {
    id: 0,
    name: 'root',
    description: 'All categories',
    allChildren: ['1', '2'],
    directChildren: ['1', '2'],
    updatedAt: '',
    createdAt: '',
  },
  '1': {
    id: 1,
    name: '03000000-1',
    description: 'Agricultural products',
    allChildren: ['3'],
    directChildren: ['3'],
    updatedAt: '',
    createdAt: '',
  },
  '2': {
    id: 2,
    name: '09000000-3',
    description: 'Petroleum products',
    allChildren: [],
    directChildren: [],
    updatedAt: '',
    createdAt: '',
  },
  '3': {
    id: 3,
    name: '03100000-2',
    description: 'Agricultural and horticultural products',
    allChildren: [],
    directChildren: [],
    updatedAt: '',
    createdAt: '',
  },
}));

const mockDismissTo = jest.fn();

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

describe('CategorySelection', () => {
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
  });

  it('renders root category items initially', () => {
    render(
      <Wrapper>
        <CategorySelection />
      </Wrapper>,
    );
    expect(screen.getByText('Agricultural products')).toBeTruthy();
    expect(screen.getByText('Petroleum products')).toBeTruthy();
  });

  it('calls dismissTo when a leaf category is pressed', async () => {
    render(
      <Wrapper>
        <CategorySelection />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Petroleum products'));
    await waitFor(() => {
      expect(mockDismissTo).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/products/[id]',
          params: expect.objectContaining({ typeSelection: 2 }),
        }),
      );
    });
  });

  it('navigates into subcategory when subcategories button is pressed', async () => {
    render(
      <Wrapper>
        <CategorySelection />
      </Wrapper>,
    );
    // Agricultural products has 1 subcategory — shows "1 subcategories" link
    await waitFor(() => {
      expect(screen.getByText(/1 subcategor/)).toBeTruthy();
    });
    fireEvent.press(screen.getByText('1 subcategories'));
    await waitFor(() => {
      expect(screen.getByText('Agricultural and horticultural products')).toBeTruthy();
    });
  });

  it('shows history breadcrumb after navigating into subcategory', async () => {
    render(
      <Wrapper>
        <CategorySelection />
      </Wrapper>,
    );
    await screen.findByText('1 subcategories');
    fireEvent.press(screen.getByText('1 subcategories'));
    await waitFor(() => {
      expect(screen.getByText('Agricultural products')).toBeTruthy();
    });
  });

  it('filters categories by search query', async () => {
    render(
      <Wrapper>
        <CategorySelection />
      </Wrapper>,
    );
    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'petroleum');
    await waitFor(() => {
      expect(screen.getByText('Petroleum products')).toBeTruthy();
      expect(screen.queryByText('Agricultural products')).toBeNull();
    });
  });
});
