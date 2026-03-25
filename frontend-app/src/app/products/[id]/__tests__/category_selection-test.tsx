import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CategorySelection from '../category_selection';
import * as cpv from '@/services/cpv';
import { renderWithProviders } from '@/test-utils';
import type { User } from '@/types/User';

const mockUseAuth = jest.fn();
const mockedLoadCPV = jest.mocked(cpv.loadCPV);

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/services/cpv', () => ({
  loadCPV: jest.fn(),
}));

const mockDismissTo = jest.fn();
const mockReplace = jest.fn();

describe('CategorySelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadCPV.mockResolvedValue({
      root: {
        id: 0,
        name: 'root',
        description: 'All categories',
        allChildren: [1, 2],
        directChildren: [1, 2],
        updatedAt: '',
        createdAt: '',
      },
      '1': {
        id: 1,
        name: '03000000-1',
        description: 'Agricultural products',
        allChildren: [3],
        directChildren: [3],
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
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '1' });
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
      dismissTo: mockDismissTo,
    });
    mockUseAuth.mockReturnValue({ user: { id: '1', username: 'testuser' } as Partial<User> });
  });

  it('redirects guests to login when directly opening category selection', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderWithProviders(<CategorySelection />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/login', params: { redirectTo: '/products/1' } });
    });
  });

  it('renders root category items initially', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('Agricultural products');
    expect(screen.getByText('Agricultural products')).toBeTruthy();
    expect(screen.getByText('Petroleum products')).toBeTruthy();
  });

  it('calls dismissTo when a leaf category is pressed', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('Petroleum products');
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
    renderWithProviders(<CategorySelection />);
    // Agricultural products has 1 subcategory — shows "1 subcategories" link
    await waitFor(() => {
      expect(screen.getByText(/1 subcategor/)).toBeTruthy(); // spell-checker: ignore subcategor
    });
    fireEvent.press(screen.getByText('1 subcategories'));
    await waitFor(() => {
      expect(screen.getByText('Agricultural and horticultural products')).toBeTruthy();
    });
  });

  it('shows history breadcrumb after navigating into subcategory', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('1 subcategories');
    fireEvent.press(screen.getByText('1 subcategories'));
    await waitFor(() => {
      expect(screen.getByText('Agricultural products')).toBeTruthy();
    });
  });

  it('pressing the history breadcrumb navigates back up to the parent level', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('1 subcategories');
    fireEvent.press(screen.getByText('1 subcategories'));
    // Now inside Agricultural products — breadcrumb shows
    await waitFor(() => {
      expect(screen.getByText('Agricultural products')).toBeTruthy();
    });
    // Pressing the breadcrumb triggers moveUp — root categories re-appear
    fireEvent.press(screen.getByText('Agricultural products'));
    await waitFor(() => {
      expect(screen.getByText('Petroleum products')).toBeTruthy();
    });
  });

  it('filters categories by search query', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByPlaceholderText('Search');
    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'petroleum');
    await waitFor(() => {
      expect(screen.getByText('Petroleum products')).toBeTruthy();
      expect(screen.queryByText('Agricultural products')).toBeNull();
    });
  });
});
