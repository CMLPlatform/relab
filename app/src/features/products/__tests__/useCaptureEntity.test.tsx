import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCaptureEntity } from '@/features/products/useCaptureEntity';

const mockMutateAsync = jest.fn<() => Promise<number>>();
const mockToast = jest.fn();
const mockError = jest.fn();

jest.mock('@/features/products/queries', () => ({
  useSaveProductMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({
    toast: mockToast,
    error: mockError,
  }),
}));

jest.mock('@/services/api/products', () => ({
  newProduct: jest.fn((seed: { parentID?: number; parentRole?: string } = {}) => ({
    id: undefined,
    role: typeof seed.parentID === 'number' ? 'component' : 'product',
    parentID: seed.parentID,
    parentRole: seed.parentRole,
    name: '',
    componentIDs: [],
    components: [],
    images: [],
    videos: [],
    physicalProperties: { weight: NaN, height: NaN, width: NaN, depth: NaN },
    circularityProperties: {
      recyclability: null,
      disassemblability: null,
      remanufacturability: null,
    },
    ownedBy: 'me',
  })),
}));

describe('useCaptureEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disallows creation below the name minimum and allows it at the minimum', () => {
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    expect(result.current.canCreate).toBe(false);

    act(() => result.current.setName('A'));
    expect(result.current.canCreate).toBe(false);

    act(() => result.current.setName('AB'));
    expect(result.current.canCreate).toBe(true);
  });

  it('creates a product and resolves the saved id, without amountInParent', async () => {
    mockMutateAsync.mockResolvedValueOnce(42);
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    act(() => result.current.setName('Widget'));

    let savedId: number | undefined;
    await act(async () => {
      savedId = await result.current.create();
    });

    expect(savedId).toBe(42);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      product: expect.objectContaining({ name: 'Widget', amountInParent: undefined }),
      originalImages: [],
      originalVideos: [],
    });
  });

  it('includes amountInParent only for components', async () => {
    mockMutateAsync.mockResolvedValueOnce(7);
    const { result } = renderHook(() =>
      useCaptureEntity({ role: 'component', parentID: 1, parentRole: 'product' }),
    );

    act(() => {
      result.current.setName('Bolt');
      result.current.setAmount(3);
    });

    await act(async () => {
      await result.current.create();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      product: expect.objectContaining({ name: 'Bolt', amountInParent: 3 }),
      originalImages: [],
      originalVideos: [],
    });
  });

  it('on failure calls feedback.error, keeps state, and resolves undefined', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    act(() => result.current.setName('Widget'));

    let savedId: number | undefined;
    await act(async () => {
      savedId = await result.current.create();
    });

    expect(savedId).toBeUndefined();
    expect(mockError).toHaveBeenCalledWith('network down');
    expect(result.current.name).toBe('Widget');
  });

  it('createAndAddAnother resets name/images/amount but keeps typeID and toasts on success', async () => {
    mockMutateAsync.mockResolvedValueOnce(9);
    const { result } = renderHook(() =>
      useCaptureEntity({ role: 'component', parentID: 1, parentRole: 'product' }),
    );

    act(() => {
      result.current.setName('Bolt');
      result.current.setTypeID(5);
      result.current.setAmount(4);
      result.current.setImages([{ url: 'x', description: '' }]);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.createAndAddAnother();
    });

    expect(ok).toBe(true);
    expect(mockToast).toHaveBeenCalledWith('Bolt added');
    expect(result.current.name).toBe('');
    expect(result.current.images).toEqual([]);
    expect(result.current.amount).toBe(1);
    expect(result.current.typeID).toBe(5);
  });

  it('createAndAddAnother returns false and keeps state on failure', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    act(() => result.current.setName('Widget'));

    let ok = true;
    await act(async () => {
      ok = await result.current.createAndAddAnother();
    });

    expect(ok).toBe(false);
    expect(mockToast).not.toHaveBeenCalled();
    expect(result.current.name).toBe('Widget');
  });

  it('isDirty reflects any field set beyond defaults', () => {
    const { result } = renderHook(() => useCaptureEntity({ role: 'component', parentID: 1 }));

    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setAmount(2));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.setAmount(1));
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setName('X'));
    expect(result.current.isDirty).toBe(true);
  });
});
