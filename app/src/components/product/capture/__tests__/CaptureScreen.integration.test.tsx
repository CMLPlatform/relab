import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { CaptureScreen } from '@/components/product/capture/CaptureScreen';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { PRODUCT_NAME_MAX_LENGTH } from '@/services/api/validation/productSchema';
import { loadCPV } from '@/services/cpv';
import { renderWithProviders } from '@/test-utils/index';

const NAME_PLACEHOLDER = /e\.g\. Cordless drill/i;

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockAddListenerImpl: (
  event: string,
  handler: (event: { preventDefault: () => void; data: { action: unknown } }) => void,
) => () => void = () => jest.fn();
const mockAddListener = jest.fn(
  (
    event: string,
    handler: (event: { preventDefault: () => void; data: { action: unknown } }) => void,
  ) => mockAddListenerImpl(event, handler),
);
const mockDispatch = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useNavigation: () => ({ addListener: mockAddListener, dispatch: mockDispatch }),
  // Never invokes its callback, matching the unit-lane default — the type-row
  // round-trip isn't under test here.
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
}));

const mockMutateAsync = jest.fn<() => Promise<number>>();
const mockUseAuth = jest.fn();

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/features/products/queries', () => ({
  useSaveProductMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  baseProductQueryOptions: (id: number | undefined) => ({
    queryKey: ['baseProduct', id ?? null],
    queryFn: () => Promise.resolve({ name: 'Drill press' }),
    enabled: typeof id === 'number',
  }),
  componentQueryOptions: (id: number | undefined) => ({
    queryKey: ['component', id ?? null],
    queryFn: () => Promise.resolve({ name: 'Drill press' }),
    enabled: typeof id === 'number',
  }),
}));

jest.mock('@/components/product/ProductImageGallery', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return function ProductImageGalleryStub() {
    return mockReact.createElement(Text, null, 'ProductImageGallery');
  };
});

jest.mock('@/services/cpv');
jest.mock('@/features/products/pendingTypeSelection', () => ({
  takePendingTypeSelection: jest.fn(),
  setPendingTypeSelection: jest.fn(),
}));

const mockedLoadCPV = jest.mocked(loadCPV);
const mockedTakePending = jest.mocked(takePendingTypeSelection);

// Renders and flushes the type row's loadCPV() resolution, so tests don't
// leave a pending act() warning from the async setSelectedType update.
async function renderCapture(props: Parameters<typeof CaptureScreen>[0]) {
  const result = renderWithProviders(<CaptureScreen {...props} />, { withDialog: true });
  await screen.findByText('Choose a type or material');
  return result;
}

describe('CaptureScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddListenerImpl = () => jest.fn();
    mockUseAuth.mockReturnValue({ user: { id: '1', username: 'owner' } });
    mockedLoadCPV.mockResolvedValue({
      root: {
        id: 0,
        name: 'root',
        description: 'All categories',
        allChildren: [],
        directChildren: [],
        updatedAt: '',
        createdAt: '',
      },
    });
    mockedTakePending.mockReturnValue(null);
  });

  it('renders the capture layout for a new product with no physical-properties section', async () => {
    await renderCapture({ entityRole: 'product' });

    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toBeOnTheScreen();
    expect(screen.getByText('Create product')).toBeOnTheScreen();
    expect(screen.queryByText('Physical properties')).toBeNull();
    expect(screen.queryByText('Component of:', { exact: false })).toBeNull();
  });

  it('enables Create once a valid name is entered', async () => {
    await renderCapture({ entityRole: 'product' });

    expect(screen.getByText('Create product')).toBeDisabled();

    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Cordless drill');

    expect(screen.getByText('Create product')).toBeEnabled();
  });

  it('routes to the saved product with edit=1 on successful create', async () => {
    mockMutateAsync.mockResolvedValueOnce(77);
    await renderCapture({ entityRole: 'product' });

    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Cordless drill');
    fireEvent.press(screen.getByText('Create product'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/products/[id]',
        params: { id: '77', edit: '1' },
      });
    });
  });

  it('routes to the saved component with edit=1 on successful create', async () => {
    mockMutateAsync.mockResolvedValueOnce(31);
    await renderCapture({ entityRole: 'component', parentID: 5, parentRole: 'product' });

    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Bolt');
    fireEvent.press(screen.getByText('Create component'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/components/[id]',
        params: { id: '31', edit: '1' },
      });
    });
  });

  it('shows the parent line and amount stepper for a component', async () => {
    await renderCapture({ entityRole: 'component', parentID: 5, parentRole: 'product' });

    expect(await screen.findByText('Component of: Drill press')).toBeOnTheScreen();
    expect(screen.getByText('Amount in parent')).toBeOnTheScreen();
    expect(screen.getByText('Create component')).toBeOnTheScreen();
    expect(screen.getByText('Create & add another')).toBeOnTheScreen();
  });

  it('keeps the screen and resets the name after Create & add another', async () => {
    mockMutateAsync.mockResolvedValueOnce(9);
    await renderCapture({ entityRole: 'component', parentID: 5, parentRole: 'product' });

    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Bolt');
    fireEvent.press(screen.getByText('Create & add another'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).props.value).toBe('');
  });

  it('keeps the entered name on screen after a failed create', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('network down'));
    await renderCapture({ entityRole: 'product' });

    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Widget');
    fireEvent.press(screen.getByText('Create product'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).props.value).toBe('Widget');
  });

  it('redirects unauthenticated users to login', async () => {
    mockUseAuth.mockReturnValue({ user: undefined });

    renderWithProviders(<CaptureScreen entityRole="product" />, { withDialog: true });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/products' },
      });
    });
  });

  it('caps the name input at the product name maximum', async () => {
    await renderCapture({ entityRole: 'product' });

    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveProp(
      'maxLength',
      PRODUCT_NAME_MAX_LENGTH,
    );
  });

  it('shows an inviting empty state instead of the undefined category card when no type is picked', async () => {
    await renderCapture({ entityRole: 'product' });

    expect(screen.getByText('Choose a type or material')).toBeOnTheScreen();
    expect(screen.queryByText('Category undefined')).toBeNull();
  });

  it('navigates to category selection when the empty-state row is pressed', async () => {
    await renderCapture({ entityRole: 'product' });

    fireEvent.press(screen.getByText('Choose a type or material'));

    expect(mockPush).toHaveBeenCalledWith('/category-selection');
  });

  it('confirms discard when leaving the screen with unsaved changes', async () => {
    let beforeRemoveHandler:
      | ((event: { preventDefault: () => void; data: { action: unknown } }) => void)
      | undefined;
    mockAddListenerImpl = (event, handler) => {
      if (event === 'beforeRemove') beforeRemoveHandler = handler;
      return jest.fn();
    };

    await renderCapture({ entityRole: 'product' });
    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Widget');

    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemoveHandler?.({ preventDefault, data: { action: { type: 'GO_BACK' } } });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByText('Discard changes?')).toBeOnTheScreen();
  });
});
