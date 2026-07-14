import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { CaptureScreen } from '@/components/product/capture/CaptureScreen';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
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
  await screen.findByText('All categories');
  return result;
}

describe('CaptureScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddListenerImpl = () => jest.fn();
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
    await renderCapture({ role: 'product' });

    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toBeOnTheScreen();
    expect(screen.getByText('Create product')).toBeOnTheScreen();
    expect(screen.queryByText('Physical properties')).toBeNull();
    expect(screen.queryByText('Component of:', { exact: false })).toBeNull();
  });

  it('enables Create once a valid name is entered', async () => {
    await renderCapture({ role: 'product' });

    expect(screen.getByText('Create product')).toBeDisabled();

    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Cordless drill');

    expect(screen.getByText('Create product')).toBeEnabled();
  });

  it('routes to the saved product with edit=1 on successful create', async () => {
    mockMutateAsync.mockResolvedValueOnce(77);
    await renderCapture({ role: 'product' });

    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Cordless drill');
    fireEvent.press(screen.getByText('Create product'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/products/[id]',
        params: { id: '77', edit: '1' },
      });
    });
  });

  it('shows the parent line and amount stepper for a component', async () => {
    await renderCapture({ role: 'component', parentID: 5, parentRole: 'product' });

    expect(await screen.findByText('Component of: Drill press')).toBeOnTheScreen();
    expect(screen.getByText('Amount in parent')).toBeOnTheScreen();
    expect(screen.getByText('Create component')).toBeOnTheScreen();
    expect(screen.getByText('Create & add another')).toBeOnTheScreen();
  });

  it('keeps the screen and resets the name after Create & add another', async () => {
    mockMutateAsync.mockResolvedValueOnce(9);
    await renderCapture({ role: 'component', parentID: 5, parentRole: 'product' });

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
    await renderCapture({ role: 'product' });

    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Widget');
    fireEvent.press(screen.getByText('Create product'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).props.value).toBe('Widget');
  });

  it('confirms discard when leaving the screen with unsaved changes', async () => {
    let beforeRemoveHandler:
      | ((event: { preventDefault: () => void; data: { action: unknown } }) => void)
      | undefined;
    mockAddListenerImpl = (event, handler) => {
      if (event === 'beforeRemove') beforeRemoveHandler = handler;
      return jest.fn();
    };

    await renderCapture({ role: 'product' });
    fireEvent.changeText(screen.getByPlaceholderText(NAME_PLACEHOLDER), 'Widget');

    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemoveHandler?.({ preventDefault, data: { action: { type: 'GO_BACK' } } });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByText('Discard changes?')).toBeOnTheScreen();
  });
});
