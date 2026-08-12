import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import CategorySelection from '@/app/category-selection';
import { setPendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { loadCPV } from '@/services/cpv';
import { renderWithProviders } from '@/test-utils/index';
import type { User } from '@/types/User';

const mockUseAuth = jest.fn();
const mockedLoadCPV = jest.mocked(loadCPV);
const mockedSetPending = jest.mocked(setPendingTypeSelection);
const SUBCATEGORY_COUNT_PATTERN = /1 subcategor/;

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/services/cpv', () => ({
  loadCPV: jest.fn(),
}));

jest.mock('@/features/products/pendingTypeSelection', () => ({
  setPendingTypeSelection: jest.fn(),
  takePendingTypeSelection: jest.fn(),
}));

const mockBack = jest.fn();
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
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: mockBack,
      setParams: jest.fn(),
      dismissTo: jest.fn(),
    });
    mockUseAuth.mockReturnValue({ user: { id: '1', username: 'testuser' } as Partial<User> });
  });

  it('redirects guests to login', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderWithProviders(<CategorySelection />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/products' },
      });
    });

    // Flush the pending loadCPV promise so it doesn't leak into the next test
    await waitFor(() => {
      expect(mockedLoadCPV).toHaveBeenCalled();
    });
  });

  it('renders root category items initially', async () => {
    renderWithProviders(<CategorySelection />);
    await waitFor(() => {
      expect(screen.getByText('Agricultural products')).toBeOnTheScreen();
      expect(screen.getByText('Petroleum products')).toBeOnTheScreen();
    });
  });

  it('hands the picked type to the pending slot and pops back when a leaf is pressed', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('Petroleum products');
    fireEvent.press(screen.getByText('Petroleum products'));
    await waitFor(() => {
      expect(mockedSetPending).toHaveBeenCalledWith(2);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('navigates into subcategory when subcategories button is pressed', async () => {
    renderWithProviders(<CategorySelection />);
    // Agricultural products has 1 subcategory; shows "1 subcategories" link
    await waitFor(() => {
      expect(screen.getByText(SUBCATEGORY_COUNT_PATTERN)).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByText('1 subcategories'));
    await waitFor(() => {
      expect(screen.getByText('Agricultural and horticultural products')).toBeOnTheScreen();
    });
  });

  it('shows history breadcrumb after navigating into subcategory', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('1 subcategories');
    fireEvent.press(screen.getByText('1 subcategories'));
    await waitFor(() => {
      expect(screen.getByText('Agricultural products')).toBeOnTheScreen();
    });
  });

  it('pressing the history breadcrumb navigates back up to the parent level', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('1 subcategories');
    fireEvent.press(screen.getByText('1 subcategories'));
    // Now inside Agricultural products; breadcrumb shows
    await waitFor(() => {
      expect(screen.getByText('Agricultural products')).toBeOnTheScreen();
    });
    // Pressing the breadcrumb triggers moveUp; root categories re-appear
    fireEvent.press(screen.getByText('Agricultural products'));
    await waitFor(() => {
      expect(screen.getByText('Petroleum products')).toBeOnTheScreen();
    });
  });

  it('filters categories by search query', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByPlaceholderText('Search');
    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'petroleum');
    await waitFor(() => {
      expect(screen.getByText('Petroleum products')).toBeOnTheScreen();
      expect(screen.queryByText('Agricultural products')).toBeNull();
    });
  });

  it('shows an empty state when the search query matches nothing', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByPlaceholderText('Search');
    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'nonexistent-widget');
    await waitFor(() => {
      expect(
        screen.getByText('No categories match “nonexistent-widget”. Try a broader term.'),
      ).toBeOnTheScreen();
    });
  });
});
