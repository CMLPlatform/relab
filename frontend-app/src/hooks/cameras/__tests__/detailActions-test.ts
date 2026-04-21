import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createCameraDetailActions } from '@/hooks/cameras/detailActions';

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: detail-action coverage keeps one cohesive action matrix together.
describe('camera detail actions', () => {
  const refetch = jest.fn();
  const replace = jest.fn();
  const alert = jest.fn();
  const configure = jest.fn<() => Promise<void>>();
  const clearLocalConnection = jest.fn<() => Promise<void> | undefined>();
  const closeEditName = jest.fn();
  const closeEditDescription = jest.fn();
  const closeManualSetup = jest.fn();
  const setLocalSetupSaving = jest.fn();
  const updateMutate =
    jest.fn<
      (
        data: { name?: string; description?: string | null },
        options?: { onSuccess?: () => void; onError?: (error: unknown) => void },
      ) => void
    >();
  const deleteMutate =
    jest.fn<
      (id: string, options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => void
    >();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeActions(overrides: Partial<Parameters<typeof createCameraDetailActions>[0]> = {}) {
    return createCameraDetailActions({
      camera: { id: 'camera-1' },
      refetch,
      router: { replace },
      feedback: { alert },
      localConnection: { configure, clearLocalConnection },
      dialogs: {
        localUrlInput: ' https://camera.local ',
        localKeyInput: ' secret-key ',
      },
      dialogActions: {
        closeEditName,
        closeEditDescription,
        closeManualSetup,
        setLocalSetupSaving,
      },
      updateMutation: { isPending: false, mutate: updateMutate },
      deleteMutation: { isPending: false, mutate: deleteMutate },
      ...overrides,
    });
  }

  it('wires save actions to the update mutation and save-failed feedback', () => {
    const actions = makeActions();

    actions.saveName('Studio Camera');
    actions.saveDescription('');

    expect(updateMutate).toHaveBeenNthCalledWith(
      1,
      { name: 'Studio Camera' },
      expect.objectContaining({ onSuccess: closeEditName, onError: expect.any(Function) }),
    );
    expect(updateMutate).toHaveBeenNthCalledWith(
      2,
      { description: null },
      expect.objectContaining({
        onSuccess: closeEditDescription,
        onError: expect.any(Function),
      }),
    );

    const saveErrorHandler = updateMutate.mock.calls[0]?.[1]?.onError as (error: unknown) => void;
    saveErrorHandler(new Error('save broke'));

    expect(alert).toHaveBeenCalledWith({
      title: 'Save failed',
      message: 'Error: save broke',
      buttons: [{ text: 'OK' }],
    });
  });

  it('wires delete actions to navigation and delete-failed feedback', () => {
    const actions = makeActions();

    actions.deleteCamera();

    expect(deleteMutate).toHaveBeenCalledWith(
      'camera-1',
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );

    const deleteSuccess = deleteMutate.mock.calls[0]?.[1]?.onSuccess as () => void;
    const deleteError = deleteMutate.mock.calls[0]?.[1]?.onError as (error: unknown) => void;

    deleteSuccess();
    deleteError('cannot delete');

    expect(replace).toHaveBeenCalledWith('/cameras');
    expect(alert).toHaveBeenCalledWith({
      title: 'Delete failed',
      message: 'cannot delete',
      buttons: [{ text: 'OK' }],
    });
  });

  it('handles refresh, disconnect, and local connection setup', async () => {
    configure.mockResolvedValueOnce(undefined);
    const actions = makeActions();

    actions.refresh();
    actions.disconnectLocal();
    await actions.connectLocal();

    expect(refetch).toHaveBeenCalled();
    expect(clearLocalConnection).toHaveBeenCalled();
    expect(configure).toHaveBeenCalledWith('https://camera.local', 'secret-key');
    expect(setLocalSetupSaving).toHaveBeenNthCalledWith(1, true);
    expect(closeManualSetup).toHaveBeenCalled();
    expect(setLocalSetupSaving).toHaveBeenLastCalledWith(false);
  });

  it('always clears local setup saving even when local configuration fails', async () => {
    configure.mockRejectedValueOnce(new Error('probe failed'));
    const actions = makeActions();

    await actions.connectLocal();

    expect(closeManualSetup).not.toHaveBeenCalled();
    expect(setLocalSetupSaving).toHaveBeenNthCalledWith(1, true);
    expect(setLocalSetupSaving).toHaveBeenLastCalledWith(false);
  });

  it('skips delete mutation when no camera is loaded', () => {
    const actions = makeActions({ camera: null });

    actions.deleteCamera();

    expect(deleteMutate).not.toHaveBeenCalled();
  });
});
