import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import CategorySelection from '@/app/category-selection';
import { MIN_TAP_TARGET } from '@/constants';
import { setPendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { useCategorySelection } from '@/features/products/useCategorySelection';
import { useRecentCategories } from '@/features/products/useRecentCategories';
import { loadCPV } from '@/services/cpv';
import { renderWithProviders } from '@/test-utils/index';
import type { User } from '@/types/User';

const mockUseAuth = jest.fn();
const mockedLoadCPV = jest.mocked(loadCPV);
const mockedSetPending = jest.mocked(setPendingTypeSelection);
const SUBCATEGORY_COUNT_PATTERN = /1 subcategor/;
const TYPING_NOW_PATTERN = /typing-now/;
const BLURB_PATTERN = /Search by name or description, or browse into a category/;
const INFO_TOOLTIP_LABEL_PATTERN = /Info: Product types come from/;

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

// Every other test in this file exercises the real hook (loadCPV mocked below
// it) end to end, so wrap — don't replace — it: jest.fn() defaults to calling
// straight through to the real implementation, and only the one test below
// overrides it (mockReturnValueOnce, self-restoring) to force a searchQuery
// vs debouncedSearchQuery mismatch that the real 300ms debounce makes
// impractical to hit deterministically in a DOM test.
jest.mock('@/features/products/useCategorySelection', () => ({
  useCategorySelection: jest.fn(
    jest.requireActual<typeof import('@/features/products/useCategorySelection')>(
      '@/features/products/useCategorySelection',
    ).useCategorySelection,
  ),
}));

const mockBack = jest.fn();
const mockReplace = jest.fn();

const PETROLEUM_RECENT = {
  id: 2,
  name: '09000000-3',
  description: 'Petroleum products',
  allChildren: [],
  directChildren: [],
  updatedAt: '',
  createdAt: '',
};

describe('CategorySelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The recents store is a module-level singleton (zustand), so it outlives
    // any single test's render — reset it here rather than letting one test's
    // recordRecent leak a duplicate "Petroleum products" node into the next.
    useRecentCategories.setState({ recents: [] });
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

  it('shows a Recent section above the list at the root when there are recent picks', async () => {
    useRecentCategories.setState({ recents: [PETROLEUM_RECENT] });
    renderWithProviders(<CategorySelection />);
    await screen.findByText('Agricultural products');

    expect(screen.getByText('Recent')).toBeOnTheScreen();
    // Once for the recents card, once for the same item in the root list.
    expect(screen.getAllByText('Petroleum products')).toHaveLength(2);
  });

  it('omits the Recent section when there are no recent picks', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('Agricultural products');

    expect(screen.queryByText('Recent')).toBeNull();
  });

  it('hides the Recent section once a search is active', async () => {
    useRecentCategories.setState({ recents: [PETROLEUM_RECENT] });
    renderWithProviders(<CategorySelection />);
    await screen.findByText('Recent');

    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'agri');

    await waitFor(() => {
      expect(screen.queryByText('Recent')).toBeNull();
    });
  });

  it('hides the Recent section once browsed into a subcategory', async () => {
    useRecentCategories.setState({ recents: [PETROLEUM_RECENT] });
    renderWithProviders(<CategorySelection />);
    await screen.findByText('1 subcategories');

    fireEvent.press(screen.getByText('1 subcategories'));

    await waitFor(() => {
      expect(screen.queryByText('Recent')).toBeNull();
    });
  });

  it('selecting a recent category hands it to the pending slot like a normal pick', async () => {
    useRecentCategories.setState({ recents: [PETROLEUM_RECENT] });
    renderWithProviders(<CategorySelection />);
    await screen.findByText('Recent');

    fireEvent.press(screen.getAllByText('Petroleum products')[0]);

    await waitFor(() => {
      expect(mockedSetPending).toHaveBeenCalledWith(2);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('records the picked category as a recent when a leaf is selected', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByText('Petroleum products');

    fireEvent.press(screen.getByText('Petroleum products'));

    await waitFor(() => {
      expect(useRecentCategories.getState().recents.map((c) => c.id)).toEqual([2]);
    });
  });

  it('shows the plain-language blurb and contextual CPV help tooltip', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByPlaceholderText('Search');
    expect(screen.getByText(BLURB_PATTERN)).toBeOnTheScreen();
    expect(screen.getByLabelText(INFO_TOOLTIP_LABEL_PATTERN)).toBeOnTheScreen();
  });

  it('meets the 44px tap-target floor on the subcategories link and history breadcrumb', async () => {
    renderWithProviders(<CategorySelection />);
    const linkButton = await screen.findByRole('button', { name: 'Browse 1 subcategories' });
    expect(StyleSheet.flatten(linkButton.props.style).minHeight).toBe(MIN_TAP_TARGET);

    fireEvent.press(linkButton);
    const historyButton = await screen.findByRole('button', {
      name: 'Go back to parent category',
    });
    expect(StyleSheet.flatten(historyButton.props.style).minHeight).toBe(MIN_TAP_TARGET);
  });

  it('filters categories by search query', async () => {
    renderWithProviders(<CategorySelection />);
    await screen.findByPlaceholderText('Search');
    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'petroleum');
    // Step the 300ms debounce off the fake clock instead of letting waitFor poll
    // for it. Polling costs seconds in this one test where every sibling here
    // runs in milliseconds, and it crossed the per-test budget on CI hardware.
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText('Petroleum products')).toBeOnTheScreen();
    expect(screen.queryByText('Agricultural products')).toBeNull();
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

  // While the 300ms debounce is still catching up to a keystroke, `filtered`
  // (computed from debouncedSearchQuery) can legitimately lag behind the
  // input's immediate searchQuery. Force that mismatch directly rather than
  // timing the real debounce, and assert the empty-state message quotes the
  // query `filtered` was actually computed from.
  it('quotes the debounced query, not the in-flight keystroke, in the empty state', () => {
    (useCategorySelection as jest.Mock).mockReturnValueOnce({
      user: { id: '1', username: 'testuser' },
      cpvClass: { id: 0, name: 'root', description: 'root', directChildren: [], allChildren: [] },
      history: [],
      filtered: [],
      recents: [],
      searchQuery: 'typing-now',
      debouncedSearchQuery: 'typing',
      setSearchQuery: jest.fn(),
      selectBranch: jest.fn(),
      moveUp: jest.fn(),
      selectType: jest.fn(),
    });

    renderWithProviders(<CategorySelection />);

    expect(screen.getByText('No categories match “typing”. Try a broader term.')).toBeOnTheScreen();
    expect(screen.queryByText(TYPING_NOW_PATTERN)).toBeNull();
  });
});
