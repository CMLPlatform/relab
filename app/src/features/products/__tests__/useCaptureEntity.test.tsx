import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCaptureEntity } from '@/features/products/useCaptureEntity';

const mockMutateAsync = jest.fn<(args: { product: { id?: number } }) => Promise<number>>();
const mockToast = jest.fn();
const mockError = jest.fn();
// Plain mutable flag (not jest.fn().mockReturnValue) so the mocked hook below
// re-reads it fresh on every render without extra setup per test.
let mockIsPaused = false;

jest.mock('@/features/products/queries', () => ({
  QUEUED_OFFLINE_LABEL: 'Queued — sends when online',
  useSaveProductMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    isPaused: mockIsPaused,
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
    mockIsPaused = false;
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
      idempotencyKey: expect.any(String),
    });
  });

  it('includes captured images in the mutation payload', async () => {
    mockMutateAsync.mockResolvedValueOnce(42);
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    act(() => {
      result.current.setName('Widget');
      result.current.setImages([{ url: 'file:///photo.jpg', description: '' }]);
    });

    await act(async () => {
      await result.current.create();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      product: expect.objectContaining({
        images: [{ url: 'file:///photo.jpg', description: '' }],
      }),
      originalImages: [],
      originalVideos: [],
      idempotencyKey: expect.any(String),
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
      idempotencyKey: expect.any(String),
    });
  });

  // Same draft, second tap after a lost response: the key has to survive the
  // failure, or the server writes a duplicate instead of replaying the first
  // create.
  it('reuses the idempotencyKey across a manual retry, then mints a fresh one for the next draft', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Network request failed'));
    mockMutateAsync.mockResolvedValueOnce(42);
    mockMutateAsync.mockResolvedValueOnce(43);
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    act(() => result.current.setName('Widget'));
    await act(async () => {
      await result.current.create();
    });
    await act(async () => {
      await result.current.create();
    });
    await act(async () => {
      await result.current.create();
    });

    const keys = mockMutateAsync.mock.calls.map(
      (call) => (call[0] as { idempotencyKey?: string }).idempotencyKey,
    );
    expect(keys[0]).toEqual(expect.any(String));
    expect(keys[1]).toBe(keys[0]);
    // The second create landed, so the third is a new draft and must not
    // replay the key the server already resolved.
    expect(keys[2]).not.toBe(keys[0]);
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
    expect(mockError).toHaveBeenCalledWith('network down', 'Create failed');
    expect(result.current.name).toBe('Widget');
  });

  // saveProduct's real saveNewProduct() POSTs, assigns the returned id onto
  // the same draft object, then uploads images — so a rejection with an id
  // already assigned means the record was created and only the upload
  // failed. Re-pressing Create must not re-POST (would duplicate the record).
  it('on a rejected image upload after a successful POST, keeps the created id and reports a partial failure', async () => {
    mockMutateAsync.mockImplementationOnce(async ({ product }) => {
      product.id = 42;
      throw new Error('upload failed');
    });
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    act(() => result.current.setName('Widget'));

    let savedId: number | undefined;
    await act(async () => {
      savedId = await result.current.create();
    });

    expect(savedId).toBe(42);
    expect(mockError).toHaveBeenCalledWith(
      'Created, but some photos failed to upload.',
      'Upload failed',
    );
  });

  it('createAndAddAnother does not toast success or reset the form on a partial failure, and surfaces the id', async () => {
    mockMutateAsync.mockImplementationOnce(async ({ product }) => {
      product.id = 9;
      throw new Error('upload failed');
    });
    const { result } = renderHook(() =>
      useCaptureEntity({ role: 'component', parentID: 1, parentRole: 'product' }),
    );

    act(() => {
      result.current.setName('Bolt');
      result.current.setImages([{ url: 'file:///photo.jpg', description: '' }]);
    });

    let outcome: { id: number; partial: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.createAndAddAnother();
    });

    expect(outcome).toEqual({ id: 9, partial: true });
    expect(mockToast).not.toHaveBeenCalled();
    expect(result.current.name).toBe('Bolt');
    expect(result.current.images).toEqual([{ url: 'file:///photo.jpg', description: '' }]);
  });

  // newProduct() derives role from parentID, which is undefined for a
  // malformed /components/new parent param — the draft must still carry the
  // role the screen was opened for so the component create URL throws
  // honestly instead of silently POSTing a top-level product.
  it('pins draft.role to the requested role even when parentID is missing', async () => {
    mockMutateAsync.mockResolvedValueOnce(3);
    const { result } = renderHook(() =>
      useCaptureEntity({ role: 'component', parentID: undefined, parentRole: 'product' }),
    );

    act(() => result.current.setName('Washer'));

    await act(async () => {
      await result.current.create();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      product: expect.objectContaining({ role: 'component' }),
      originalImages: [],
      originalVideos: [],
      idempotencyKey: expect.any(String),
    });
  });

  it('guards against a double Create firing two mutations', async () => {
    let resolveMutate: ((id: number) => void) | undefined;
    mockMutateAsync.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolveMutate = resolve;
        }),
    );
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));
    act(() => result.current.setName('Widget'));

    let firstResult: number | undefined;
    let secondResult: number | undefined;
    await act(async () => {
      const first = result.current.create().then((id) => {
        firstResult = id;
      });
      const second = result.current.create().then((id) => {
        secondResult = id;
      });
      resolveMutate?.(42);
      await Promise.all([first, second]);
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(42);
    expect(secondResult).toBeUndefined();
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

    let outcome: { id: number; partial: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.createAndAddAnother();
    });

    expect(outcome).toEqual({ id: 9, partial: false });
    expect(mockToast).toHaveBeenCalledWith('Bolt added');
    expect(result.current.name).toBe('');
    expect(result.current.images).toEqual([]);
    expect(result.current.amount).toBe(1);
    expect(result.current.typeID).toBe(5);
  });

  it('createAndAddAnother returns undefined and keeps state on total failure', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    act(() => result.current.setName('Widget'));

    let outcome: { id: number; partial: boolean } | undefined = { id: -1, partial: false };
    await act(async () => {
      outcome = await result.current.createAndAddAnother();
    });

    expect(outcome).toBeUndefined();
    expect(mockToast).not.toHaveBeenCalled();
    expect(result.current.name).toBe('Widget');
  });

  // TDD for the offline-queued acknowledgment: a paused mutation must not
  // just leave the Create button spinning — the screen surfaces it (a toast,
  // fired once) and exposes isPaused so the button can swap its label.
  it('exposes isPaused and toasts once when the save mutation pauses offline', () => {
    mockIsPaused = true;
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    expect(result.current.isPaused).toBe(true);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('Queued — sends when online');
  });

  it('does not toast when the save mutation is not paused', () => {
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    expect(result.current.isPaused).toBe(false);
    expect(mockToast).not.toHaveBeenCalled();
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

  // createAndAddAnother deliberately keeps typeID across a batch create, so
  // counting it toward isDirty made the freshly reset screen look dirty and
  // triggered a spurious "Discard changes?" prompt on the way out.
  it('isDirty ignores a kept type selection', () => {
    const { result } = renderHook(() => useCaptureEntity({ role: 'product' }));

    act(() => result.current.setTypeID(5));
    expect(result.current.isDirty).toBe(false);
  });
});
